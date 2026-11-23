import type {
  AccountKey,
  ConversationEvent,
  SyncManifest,
  SyncStatus,
} from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";
import { OutboxProcessor } from "../outbox/outboxProcessor.js";
import { HttpClient, HttpError } from "../transport/httpClient.js";
import { WebSocketClient } from "../transport/websocketClient.js";
import { applyEvent } from "./applyEvent.js";
import { SnapshotRequiredError } from "./errors.js";

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
}

interface ApiConversation {
  id: string;
  title?: string | null;
  type?: string;
  hasExternalMembers?: boolean;
  lastEventSeq?: number;
  memberCount?: number;
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

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const status: SyncStatus = {
    runtime: "idle",
    wsConnected: false,
  };
  const listeners = new Set<(s: SyncStatus) => void>();

  const notify = (patch: Partial<SyncStatus>) => {
    Object.assign(status, patch);
    for (const listener of listeners) {
      listener({ ...status });
    }
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
  });

  const handleWsEvent = (event: ConversationEvent) => {
    void applyEvent(options.db, options.accountKey, event).catch((error) => {
      if (error instanceof Error && error.name === "SyncGapError") {
        void synchronize();
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

  async function applyManifest(manifest: SyncManifest): Promise<void> {
    const directory = await upsertConversationsFromDirectory();

    for (const entry of manifest.conversations) {
      const conversationId = entry.conversationId;
      const meta = directory.get(conversationId);
      const existing = await options.db.conversations.get(conversationId);
      await options.db.conversations.put({
        accountKey: options.accountKey,
        id: conversationId,
        title: meta?.title?.trim() || existing?.title || conversationId,
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
      const afterSeq = cursor?.eventSeq ?? 0;
      ws.subscribeConversation(conversationId);

      if (entry.lastEventSeq > afterSeq) {
        await pullConversationDelta(conversationId, afterSeq);
      }
    }
  }

  async function pullConversationDelta(
    conversationId: string,
    afterSeq: number,
  ): Promise<void> {
    try {
      const page = await options.http.get<ApiEvent[] | { events: ApiEvent[]; snapshotRequired?: boolean }>(
        `/v1/conversations/${conversationId}/events?afterSeq=${afterSeq}`,
      );

      const events = Array.isArray(page) ? page : page.events;
      const snapshotRequired = Array.isArray(page)
        ? false
        : Boolean(page.snapshotRequired);

      if (snapshotRequired) {
        throw new SnapshotRequiredError(conversationId);
      }

      for (const raw of events) {
        await applyEvent(options.db, options.accountKey, toConversationEvent(raw));
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        notify({
          lastError: `snapshot_required:${conversationId}`,
          runtime: "error",
        });
        throw new SnapshotRequiredError(conversationId);
      }
      throw error;
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
      await ws.connect();
      await synchronize();
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
  };
}
