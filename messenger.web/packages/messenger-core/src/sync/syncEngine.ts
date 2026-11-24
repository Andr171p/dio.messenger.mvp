import type {
  AccountKey,
  ConversationEvent,
  PresenceState,
  SyncManifest,
  SyncStatus,
  TypingState,
} from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";
import { OutboxProcessor } from "../outbox/outboxProcessor.js";
import { HttpClient, HttpError } from "../transport/httpClient.js";
import { WebSocketClient } from "../transport/websocketClient.js";
import { applyEvent } from "./applyEvent.js";
import { SnapshotRequiredError } from "./errors.js";
import { wipeConversation } from "./wipeConversation.js";
import { projectMessage, type ServerMessage } from "./projectMessage.js";

export interface SyncEngineOptions {
  onFailure?: (kind: "sync_failed" | "outbox_retry" | "outbox_rejected") => void;
  onTiming?: (kind: "send_ack" | "sync_recovery", durationMs: number) => void;
  db: MessengerDatabase;
  accountKey: AccountKey;
  userId?: string;
  onAccessRevoked?: (conversationId: string) => void;
  http: HttpClient;
  wsBaseUrl: string;
}

export interface SyncEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  requestFlush(): void;
  synchronize(): Promise<void>;
  pauseSending(): void;
  watchConversation(conversationId: string): void;
  loadHistory(
    conversationId: string,
    options?: { beforeSeq?: number; aroundMessageId?: string },
  ): Promise<ServerMessage[]>;
  sendTyping(conversationId: string, started: boolean): void;
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  getPresence(userId: string): PresenceState | undefined;
  getTyping(conversationId: string): TypingState | undefined;
  subscribePresence(listener: () => void): () => void;
}

interface ApiConversation {
  id: string;
  title?: string | null;
  type?: string;
  hasExternalMembers?: boolean;
  lastEventSeq?: number;
  memberCount?: number;
}

interface SnapshotResponse {
  conversation: {
    id: string;
    type?: string;
    title?: string | null;
    lastEventSeq: number;
  };
  membership: {
    historyFromSeq?: number;
    lastReadMessageSeq?: number;
    lastDeliveredMessageSeq?: number;
  };
  messages: ServerMessage[];
  messagesTruncated?: boolean;
  snapshotEventSeq: number;
}

function mapConversationKind(type?: string): "direct" | "group" | undefined {
  if (!type) return undefined;
  const upper = type.toUpperCase();
  if (upper === "DIRECT") return "direct";
  if (upper === "GROUP") return "group";
  return undefined;
}

interface ApiEvent {
  id: string;
  conversationId: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
}

function toConversationEvent(raw: ApiEvent): ConversationEvent {
  return {
    conversationId: raw.conversationId,
    eventSeq: raw.seq,
    eventId: raw.id,
    type: raw.type as ConversationEvent["type"],
    payload: raw.payload ?? {},
  };
}

const EVENTS_PAGE_LIMIT = 50;

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const status: SyncStatus = {
    runtime: "idle",
    wsConnected: false,
  };
  const listeners = new Set<(s: SyncStatus) => void>();
  const presenceListeners = new Set<() => void>();
  const presenceByUser = new Map<string, PresenceState>();
  const typingByConversation = new Map<string, TypingState>();
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const delivered = new Map<string, number>();
  const pulling = new Set<string>();
  let syncing: Promise<void> | null = null;
  let stopped = false;
  let accessVerified = false;
  const revoked = new Set<string>();

  const notify = (patch: Partial<SyncStatus>) => {
    Object.assign(status, patch);
    for (const listener of listeners) {
      listener({ ...status });
    }
  };

  const notifyPresence = () => {
    for (const listener of presenceListeners) listener();
  };

  function clearTyping() {
    for (const timer of typingTimers.values()) clearTimeout(timer);
    typingTimers.clear();
    typingByConversation.clear();
    notifyPresence();
  }

  async function acknowledgeDelivery(conversationId: string, seq: number) {
    const previous = delivered.get(conversationId) ?? 0;
    if (seq <= previous || stopped || revoked.has(conversationId)) return;
    delivered.set(conversationId, seq);
    try {
      await options.http.put(
        "/v1/conversations/" + conversationId + "/delivery-cursor",
        {
          lastDeliveredMessageSeq: seq,
        },
      );
    } catch {
      if (delivered.get(conversationId) === seq)
        delivered.set(conversationId, previous);
    }
  }

  const outbox = new OutboxProcessor({
    db: options.db,
    accountKey: options.accountKey,
    http: options.http,
    canFlush: () =>
      accessVerified && (typeof navigator === "undefined" || navigator.onLine),
    onFailure: options.onFailure,
    onSendAck: (durationMs) => options.onTiming?.("send_ack", durationMs),
  });

  const ws = new WebSocketClient({
    http: options.http,
    wsBaseUrl: options.wsBaseUrl,
    onConnectionChange: (connected) => {
      notify({
        wsConnected: connected,
        runtime:
          !connected && (status.runtime === "error" || syncing)
            ? status.runtime
            : connected
              ? "connected"
              : "disconnected",
      });
      if (connected) {
        void synchronize().catch(() => undefined);
      } else {
        clearTyping();
      }
    },
    onAccessRevoked: ({ conversationId }) => {
      revoked.add(conversationId);
      options.onAccessRevoked?.(conversationId);
      void (async () => {
        ws.unsubscribeConversation(conversationId);
        await wipeConversation(options.db, options.accountKey, conversationId);
      })().catch(() => undefined);
    },
    onEphemeral: ({ type, payload }) => {
      if (type === "typing.updated") {
        const conversationId =
          typeof payload.conversationId === "string" ? payload.conversationId : null;
        if (!conversationId) return;
        const userIds = Array.isArray(payload.userIds)
          ? payload.userIds.filter((u): u is string => typeof u === "string")
          : typeof payload.userId === "string"
            ? [payload.userId]
            : [];
        const active = payload.active !== false && payload.status !== "stopped";
        const prev = typingByConversation.get(conversationId);
        const nextIds = new Set(prev?.userIds ?? []);
        for (const id of userIds) {
          const key = conversationId + ":" + id;
          clearTimeout(typingTimers.get(key));
          typingTimers.delete(key);
          if (!active) {
            nextIds.delete(id);
            continue;
          }
          nextIds.add(id);
          typingTimers.set(
            key,
            setTimeout(() => {
              typingTimers.delete(key);
              const state = typingByConversation.get(conversationId);
              if (state) {
                state.userIds = state.userIds.filter((userId) => userId !== id);
                if (!state.userIds.length) typingByConversation.delete(conversationId);
              }
              notifyPresence();
            }, 6_000),
          );
        }
        if (!nextIds.size) typingByConversation.delete(conversationId);
        else
          typingByConversation.set(conversationId, {
            conversationId,
            userIds: [...nextIds],
            updatedAt: Date.now(),
          });
        notifyPresence();
        return;
      }

      if (type === "presence.changed") {
        const userId = typeof payload.userId === "string" ? payload.userId : null;
        if (!userId) return;
        const online =
          payload.status === "online" ||
          payload.online === true ||
          payload.state === "online";
        presenceByUser.set(userId, {
          userId,
          status: online ? "online" : "offline",
          lastSeenAt:
            typeof payload.lastSeenAt === "string"
              ? Date.parse(payload.lastSeenAt)
              : typeof payload.lastSeenAt === "number"
                ? payload.lastSeenAt
                : Date.now(),
        });
        notifyPresence();
        return;
      }

      if (type === "receipt.delivered_updated") {
        const conversationId =
          typeof payload.conversationId === "string" ? payload.conversationId : null;
        const seq =
          typeof payload.lastDeliveredMessageSeq === "number"
            ? payload.lastDeliveredMessageSeq
            : typeof payload.messageSeq === "number"
              ? payload.messageSeq
              : null;
        if (!conversationId || seq === null) return;
        void options.db.messages
          .where("[accountKey+conversationId]")
          .equals([options.accountKey, conversationId])
          .modify((msg) => {
            if (
              msg.isOutgoing &&
              msg.createdSeq !== undefined &&
              msg.createdSeq <= seq &&
              msg.deliveryStatus !== "read"
            ) {
              msg.deliveryStatus = "delivered";
            }
          });
      }
    },
  });

  /** Compact WS hints: pull HTTP delta; never apply incomplete projection / advance cursor. */
  const handleWsEvent = (event: ConversationEvent) => {
    void pullConversationUntilCaughtUp(event.conversationId).catch((error) => {
      if (error instanceof SnapshotRequiredError) {
        void applySnapshot(event.conversationId).catch(() => undefined);
      }
    });
  };

  async function getConversationDirectory(): Promise<Map<string, ApiConversation>> {
    const list = await options.http.get<ApiConversation[]>("/v1/conversations");
    return new Map(list.map((row) => [row.id, row]));
  }

  async function applySnapshot(conversationId: string): Promise<void> {
    const snap = await options.http.get<SnapshotResponse>(
      `/v1/conversations/${conversationId}/snapshot?messageLimit=100`,
    );

    const historyFromSeq = snap.membership.historyFromSeq ?? 1;

    await options.db.transaction(
      "rw",
      options.db.messages,
      options.db.conversations,
      options.db.syncCursors,
      async () => {
        if (
          revoked.has(conversationId) ||
          !(await options.db.conversations.get(conversationId))
        )
          return;
        // Replace projection messages; keep outbox intact
        await options.db.messages
          .where("[accountKey+conversationId]")
          .equals([options.accountKey, conversationId])
          .filter((m) => m.sendStatus === "sent" || m.serverId !== undefined)
          .delete();

        const messages = snap.messages
          .filter((message) => message.createdSeq >= historyFromSeq)
          .map((message) =>
            projectMessage(message, options.accountKey, conversationId, options.userId),
          );
        const latest = messages
          .filter((message) => !message.deletedAt)
          .reduce<(typeof messages)[number] | undefined>(
            (last, message) =>
              !last || (message.createdSeq ?? 0) > (last.createdSeq ?? 0)
                ? message
                : last,
            undefined,
          );
        const existing = await options.db.conversations.get(conversationId);
        await options.db.conversations.put({
          accountKey: options.accountKey,
          id: conversationId,
          title: snap.conversation.title?.trim() || existing?.title || conversationId,
          lastMessagePreview: latest?.content.slice(0, 120),
          lastMessageAt: latest?.createdAt,
          unreadCount: messages.filter(
            (message) =>
              !message.isOutgoing &&
              !message.deletedAt &&
              (message.createdSeq ?? 0) > (snap.membership.lastReadMessageSeq ?? 0),
          ).length,
          lastReadMessageSeq: snap.membership.lastReadMessageSeq,
          isGuest: existing?.isGuest ?? false,
          hasExternalMembers: existing?.hasExternalMembers,
          kind: mapConversationKind(snap.conversation.type) ?? existing?.kind,
          memberCount: existing?.memberCount,
          isPinned: existing?.isPinned ?? false,
          updatedAt: latest?.createdAt ?? existing?.updatedAt ?? Date.now(),
        });

        for (const message of messages) {
          const local = await options.db.messages.get(message.localId);
          await options.db.messages.put({
            ...local,
            ...message,
            isOutgoing: message.isOutgoing || local?.isOutgoing === true,
          });
        }

        await options.db.syncCursors.put({
          accountKey: options.accountKey,
          conversationId,
          eventSeq: snap.snapshotEventSeq,
        });
      },
    );

    // Catch any events after snapshot
    delivered.set(
      conversationId,
      Math.max(
        delivered.get(conversationId) ?? 0,
        snap.membership.lastDeliveredMessageSeq ?? 0,
      ),
    );
    const newestIncoming = snap.messages.reduce(
      (latest, message) =>
        message.senderId !== options.userId &&
        !message.deletedAt &&
        message.createdSeq >= historyFromSeq
          ? Math.max(latest, message.createdSeq)
          : latest,
      0,
    );
    void acknowledgeDelivery(conversationId, newestIncoming);
    await pullConversationDelta(conversationId, snap.snapshotEventSeq);
  }

  async function applyManifest(
    manifest: SyncManifest,
    previouslyRevoked: Set<string>,
  ): Promise<void> {
    const allowed = new Set(manifest.conversations.map((c) => c.conversationId));

    const localConversations = await options.db.conversations
      .where("accountKey")
      .equals(options.accountKey)
      .toArray();

    for (const local of localConversations) {
      if (!allowed.has(local.id)) {
        ws.unsubscribeConversation(local.id);
        options.onAccessRevoked?.(local.id);
        await wipeConversation(options.db, options.accountKey, local.id);
      }
    }

    const directory = await getConversationDirectory();
    for (const entry of manifest.conversations) {
      const conversationId = entry.conversationId;
      if (previouslyRevoked.has(conversationId)) revoked.delete(conversationId);
      if (revoked.has(conversationId)) continue;
      const meta = directory.get(conversationId);
      const existing = await options.db.conversations.get(conversationId);
      await options.db.conversations.put({
        accountKey: options.accountKey,
        id: conversationId,
        title: meta?.title?.trim() || existing?.title || entry.title || conversationId,
        lastMessagePreview: existing?.lastMessagePreview,
        lastMessageAt: existing?.lastMessageAt,
        unreadCount: existing?.unreadCount ?? 0,
        lastReadMessageSeq: Math.max(
          existing?.lastReadMessageSeq ?? 0,
          entry.lastReadMessageSeq ?? 0,
        ),
        isGuest:
          meta?.hasExternalMembers ?? entry.isGuest ?? existing?.isGuest ?? false,
        hasExternalMembers: meta?.hasExternalMembers ?? existing?.hasExternalMembers,
        kind: mapConversationKind(meta?.type) ?? existing?.kind,
        memberCount: meta?.memberCount ?? existing?.memberCount,
        isPinned: existing?.isPinned ?? false,
        updatedAt: existing?.updatedAt ?? Date.now(),
      });

      const cursor = await options.db.syncCursors.get([
        options.accountKey,
        conversationId,
      ]);
      const afterSeq = cursor?.eventSeq ?? 0;
      const historyFromSeq = entry.historyFromSeq ?? 1;
      delivered.set(
        conversationId,
        Math.max(
          delivered.get(conversationId) ?? 0,
          entry.lastDeliveredMessageSeq ?? 0,
        ),
      );
      if (afterSeq > 0 && afterSeq + 1 < historyFromSeq) {
        // Cursor behind retained history → snapshot
        await applySnapshot(conversationId);
        continue;
      }

      ws.subscribeConversation(conversationId);

      if (entry.lastEventSeq > afterSeq) {
        try {
          // Prefer snapshot for cold start on busy chats (avoids hundreds of delta pages).
          if (afterSeq === 0 && entry.lastEventSeq > 80) {
            await applySnapshot(conversationId);
          } else {
            await pullConversationUntilCaughtUp(conversationId, entry.lastEventSeq);
          }
        } catch (error) {
          if (error instanceof SnapshotRequiredError) {
            await applySnapshot(conversationId);
          } else {
            // Continue other conversations — one failure must not empty the list.
            notify({
              lastError: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      const latestIncoming = await options.db.messages
        .where("[accountKey+conversationId+createdSeq]")
        .between(
          [
            options.accountKey,
            conversationId,
            Math.max(historyFromSeq, (delivered.get(conversationId) ?? 0) + 1),
          ],
          [options.accountKey, conversationId, Number.MAX_SAFE_INTEGER],
          true,
          true,
        )
        .reverse()
        .filter((message) => !message.isOutgoing && !message.deletedAt)
        .first();
      if (latestIncoming?.createdSeq)
        void acknowledgeDelivery(conversationId, latestIncoming.createdSeq);
    }
  }

  async function pullConversationDelta(
    conversationId: string,
    afterSeq: number,
  ): Promise<number> {
    const page = await options.http.get<
      ApiEvent[] | { events: ApiEvent[]; snapshotRequired?: boolean }
    >(
      `/v1/conversations/${conversationId}/events?afterSeq=${afterSeq}&limit=${EVENTS_PAGE_LIMIT}`,
    );

    const events = Array.isArray(page) ? page : page.events;
    const snapshotRequired = Array.isArray(page)
      ? false
      : Boolean(page.snapshotRequired);

    if (snapshotRequired) {
      throw new SnapshotRequiredError(conversationId);
    }

    let lastApplied = afterSeq;
    let newestIncoming = 0;
    for (const raw of events) {
      if (stopped || revoked.has(conversationId)) break;
      await applyEvent(
        options.db,
        options.accountKey,
        toConversationEvent(raw),
        options.userId,
        true,
      );
      lastApplied = raw.seq;
      if (
        raw.type === "message.created" &&
        raw.payload.senderId !== options.userId &&
        typeof raw.payload.senderId === "string" &&
        typeof raw.payload.createdSeq === "number"
      )
        newestIncoming = Math.max(newestIncoming, raw.payload.createdSeq);
    }
    void acknowledgeDelivery(conversationId, newestIncoming);
    return lastApplied;
  }

  async function pullConversationUntilCaughtUp(
    conversationId: string,
    targetSeq?: number,
  ): Promise<void> {
    if (pulling.has(conversationId)) return;
    pulling.add(conversationId);
    try {
      for (let guard = 0; guard < 100; guard += 1) {
        const cursor = await options.db.syncCursors.get([
          options.accountKey,
          conversationId,
        ]);
        const afterSeq = cursor?.eventSeq ?? 0;
        if (targetSeq !== undefined && afterSeq >= targetSeq) return;

        let lastApplied: number;
        try {
          lastApplied = await pullConversationDelta(conversationId, afterSeq);
        } catch (error) {
          if (error instanceof HttpError && error.status === 409) {
            throw new SnapshotRequiredError(conversationId);
          }
          throw error;
        }

        if (lastApplied <= afterSeq) {
          // empty page
          return;
        }
        if (targetSeq !== undefined && lastApplied >= targetSeq) return;
        // if we got a full page, continue
        if (lastApplied - afterSeq < EVENTS_PAGE_LIMIT) return;
      }
    } finally {
      pulling.delete(conversationId);
    }
  }

  async function runSync(): Promise<void> {
    const started = performance.now();
    accessVerified = false;
    const previouslyRevoked = new Set(revoked);
    notify({ runtime: "syncing" });
    try {
      const manifest = await options.http.get<SyncManifest>("/v1/sync/manifest");
      await applyManifest(manifest, previouslyRevoked);
      if (stopped) return;
      accessVerified = true;
      options.onTiming?.("sync_recovery", performance.now() - started);
      outbox.requestFlush();
      notify({ runtime: "connected", lastSyncAt: Date.now(), lastError: undefined });
    } catch (error) {
      if (!stopped && (typeof navigator === "undefined" || navigator.onLine))
        options.onFailure?.("sync_failed");
      notify({
        runtime: "error",
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  function synchronize(): Promise<void> {
    if (stopped) return Promise.resolve();
    syncing ??= runSync().finally(() => {
      syncing = null;
    });
    return syncing;
  }

  return {
    async start() {
      stopped = false;
      notify({ runtime: "starting" });
      ws.subscribe(handleWsEvent);
      outbox.start();
      // HTTP sync must not depend on WebSocket — empty UI if ticket/WS fails first.
      try {
        await synchronize();
      } catch (error) {
        notify({
          runtime: "error",
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
      if (stopped) return;
      void ws.connect().catch((error) => {
        notify({
          lastError: error instanceof Error ? error.message : String(error),
          wsConnected: false,
          runtime: status.runtime === "error" ? "error" : "disconnected",
        });
      });
    },
    async stop() {
      stopped = true;
      accessVerified = false;
      ws.disconnect();
      clearTyping();
      outbox.stop();
      notify({ runtime: "idle", wsConnected: false });
    },
    requestFlush() {
      outbox.requestFlush();
    },
    synchronize,
    pauseSending() {
      accessVerified = false;
    },
    watchConversation(conversationId: string) {
      ws.subscribeConversation(conversationId);
    },
    async loadHistory(conversationId, { beforeSeq, aroundMessageId } = {}) {
      const params = new URLSearchParams({ limit: "50" });
      if (beforeSeq !== undefined) params.set("beforeSeq", String(beforeSeq));
      if (aroundMessageId) params.set("aroundMessageId", aroundMessageId);
      const messages = await options.http.get<ServerMessage[]>(
        `/v1/conversations/${conversationId}/messages?${params}`,
      );
      await options.db.transaction(
        "rw",
        options.db.messages,
        options.db.conversations,
        async () => {
          if (!(await options.db.conversations.get(conversationId))) return;
          for (const entry of messages) {
            const message = projectMessage(
              entry,
              options.accountKey,
              conversationId,
              options.userId,
            );
            const existing = await options.db.messages.get(message.localId);
            if (!existing || existing.revision < message.revision) {
              await options.db.messages.put({ ...existing, ...message });
            }
          }
        },
      );
      return messages;
    },
    sendTyping(conversationId: string, started: boolean) {
      ws.sendTyping(conversationId, started);
    },
    getStatus() {
      return { ...status };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPresence(userId: string) {
      return presenceByUser.get(userId);
    },
    getTyping(conversationId: string) {
      return typingByConversation.get(conversationId);
    },
    subscribePresence(listener) {
      presenceListeners.add(listener);
      return () => presenceListeners.delete(listener);
    },
  };
}
