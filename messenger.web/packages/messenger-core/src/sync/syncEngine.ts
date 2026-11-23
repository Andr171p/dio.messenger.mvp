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
import { extractPlainText } from "../content/blocks.js";

export interface SyncEngineOptions {
  db: MessengerDatabase;
  accountKey: AccountKey;
  http: HttpClient;
  wsBaseUrl: string;
}

export interface SyncEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  requestFlush(): void;
  synchronize(): Promise<void>;
  watchConversation(conversationId: string): void;
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
  messages: Array<{
    id: string;
    clientMessageId?: string;
    createdSeq: number;
    revision?: number;
    senderId: string;
    content?: unknown;
    replyToId?: string | null;
    createdAt?: string;
  }>;
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
  const pulling = new Set<string>();

  const notify = (patch: Partial<SyncStatus>) => {
    Object.assign(status, patch);
    for (const listener of listeners) {
      listener({ ...status });
    }
  };

  const notifyPresence = () => {
    for (const listener of presenceListeners) listener();
  };

  const outbox = new OutboxProcessor({
    db: options.db,
    accountKey: options.accountKey,
    http: options.http,
  });

  const ws = new WebSocketClient({
    http: options.http,
    wsBaseUrl: options.wsBaseUrl,
    onConnectionChange: (connected) => {
      notify({ wsConnected: connected, runtime: connected ? "connected" : "disconnected" });
      if (connected) {
        void synchronize();
      }
    },
    onAccessRevoked: ({ conversationId }) => {
      void (async () => {
        ws.unsubscribeConversation(conversationId);
        await wipeConversation(options.db, options.accountKey, conversationId);
      })();
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
        if (active) {
          for (const id of userIds) nextIds.add(id);
        } else {
          for (const id of userIds) nextIds.delete(id);
          if (typeof payload.userId === "string") nextIds.delete(payload.userId);
        }
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

  async function upsertConversationsFromDirectory(): Promise<Map<string, ApiConversation>> {
    const list = await options.http.get<ApiConversation[]>("/v1/conversations");
    const map = new Map<string, ApiConversation>();
    for (const row of list) {
      map.set(row.id, row);
      const existing = await options.db.conversations.get(row.id);
      await options.db.conversations.put({
        accountKey: options.accountKey,
        id: row.id,
        title: row.title?.trim() || existing?.title || row.id,
        lastMessagePreview: existing?.lastMessagePreview,
        lastMessageAt: existing?.lastMessageAt,
        unreadCount: existing?.unreadCount ?? 0,
        isGuest: row.hasExternalMembers ?? existing?.isGuest ?? false,
        hasExternalMembers: row.hasExternalMembers ?? existing?.hasExternalMembers,
        kind: mapConversationKind(row.type) ?? existing?.kind,
        memberCount: row.memberCount ?? existing?.memberCount,
        isPinned: existing?.isPinned ?? false,
        updatedAt: existing?.updatedAt ?? Date.now(),
      });
    }
    return map;
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
        // Replace projection messages; keep outbox intact
        await options.db.messages
          .where("[accountKey+conversationId]")
          .equals([options.accountKey, conversationId])
          .filter((m) => m.sendStatus === "sent" || m.serverId !== undefined)
          .delete();

        const existing = await options.db.conversations.get(conversationId);
        await options.db.conversations.put({
          accountKey: options.accountKey,
          id: conversationId,
          title: snap.conversation.title?.trim() || existing?.title || conversationId,
          lastMessagePreview: existing?.lastMessagePreview,
          lastMessageAt: existing?.lastMessageAt,
          unreadCount: existing?.unreadCount ?? 0,
          isGuest: existing?.isGuest ?? false,
          hasExternalMembers: existing?.hasExternalMembers,
          kind: mapConversationKind(snap.conversation.type) ?? existing?.kind,
          memberCount: existing?.memberCount,
          isPinned: existing?.isPinned ?? false,
          updatedAt: Date.now(),
        });

        for (const msg of snap.messages) {
          if (msg.createdSeq < historyFromSeq) continue;
          const clientMessageId = msg.clientMessageId ?? msg.id;
          const content = extractPlainText(msg.content) || "";
          await options.db.messages.put({
            accountKey: options.accountKey,
            localId: clientMessageId,
            clientMessageId,
            conversationId,
            serverId: msg.id,
            content,
            createdAt: msg.createdAt ? Date.parse(msg.createdAt) : Date.now(),
            createdSeq: msg.createdSeq,
            revision: msg.revision ?? 1,
            replyToId: msg.replyToId ?? undefined,
            sendStatus: "sent",
            isOutgoing: false,
            authorId: msg.senderId,
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
    await pullConversationDelta(conversationId, snap.snapshotEventSeq);
  }

  async function applyManifest(manifest: SyncManifest): Promise<void> {
    const directory = await upsertConversationsFromDirectory();
    const allowed = new Set(manifest.conversations.map((c) => c.conversationId));
    for (const id of directory.keys()) allowed.add(id);

    const localConversations = await options.db.conversations
      .where("accountKey")
      .equals(options.accountKey)
      .toArray();

    for (const local of localConversations) {
      if (!allowed.has(local.id)) {
        ws.unsubscribeConversation(local.id);
        await wipeConversation(options.db, options.accountKey, local.id);
      }
    }

    for (const entry of manifest.conversations) {
      const conversationId = entry.conversationId;
      const meta = directory.get(conversationId);
      const existing = await options.db.conversations.get(conversationId);
      await options.db.conversations.put({
        accountKey: options.accountKey,
        id: conversationId,
        title: meta?.title?.trim() || existing?.title || entry.title || conversationId,
        lastMessagePreview: existing?.lastMessagePreview,
        lastMessageAt: existing?.lastMessageAt,
        unreadCount: existing?.unreadCount ?? 0,
        isGuest:
          meta?.hasExternalMembers ?? entry.isGuest ?? existing?.isGuest ?? false,
        hasExternalMembers:
          meta?.hasExternalMembers ?? existing?.hasExternalMembers,
        kind: mapConversationKind(meta?.type) ?? existing?.kind,
        memberCount: meta?.memberCount ?? existing?.memberCount,
        isPinned: existing?.isPinned ?? false,
        updatedAt: existing?.updatedAt ?? Date.now(),
      });

      const cursor = await options.db.syncCursors.get([
        options.accountKey,
        conversationId,
      ]);
      let afterSeq = cursor?.eventSeq ?? 0;
      const historyFromSeq = entry.historyFromSeq ?? 1;
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
              lastError:
                error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }
  }

  async function pullConversationDelta(
    conversationId: string,
    afterSeq: number,
  ): Promise<number> {
    const page = await options.http.get<
      ApiEvent[] | { events: ApiEvent[]; snapshotRequired?: boolean }
    >(`/v1/conversations/${conversationId}/events?afterSeq=${afterSeq}&limit=${EVENTS_PAGE_LIMIT}`);

    const events = Array.isArray(page) ? page : page.events;
    const snapshotRequired = Array.isArray(page)
      ? false
      : Boolean(page.snapshotRequired);

    if (snapshotRequired) {
      throw new SnapshotRequiredError(conversationId);
    }

    let lastApplied = afterSeq;
    for (const raw of events) {
      await applyEvent(options.db, options.accountKey, toConversationEvent(raw));
      lastApplied = raw.seq;
    }
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

  async function synchronize(): Promise<void> {
    notify({ runtime: "syncing" });
    try {
      const manifest = await options.http.get<SyncManifest>("/v1/sync/manifest");
      await applyManifest(manifest);
      notify({ runtime: "connected", lastSyncAt: Date.now(), lastError: undefined });
    } catch (error) {
      notify({
        runtime: "error",
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return {
    async start() {
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
      void ws.connect().catch((error) => {
        notify({
          lastError: error instanceof Error ? error.message : String(error),
          wsConnected: false,
          runtime: status.runtime === "error" ? "error" : "disconnected",
        });
      });
    },
    async stop() {
      ws.disconnect();
      outbox.stop();
      notify({ runtime: "idle", wsConnected: false });
    },
    requestFlush() {
      outbox.requestFlush();
    },
    synchronize,
    watchConversation(conversationId: string) {
      ws.subscribeConversation(conversationId);
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
