import Dexie, { type Table } from "dexie";
import type {
  AccountKey,
  Conversation,
  Draft,
  LocalMessage,
  OutboxItem,
  SyncCursor,
  VoiceUpload,
} from "../models/types.js";

export const DB_NAME_PREFIX = "dio-messenger";

export class MessengerDatabase extends Dexie {
  messages!: Table<LocalMessage, string>;
  conversations!: Table<Conversation, string>;
  drafts!: Table<Draft, string>;
  outbox!: Table<OutboxItem, string>;
  syncCursors!: Table<SyncCursor, [AccountKey, string]>;
  voiceUploads!: Table<VoiceUpload, string>;

  constructor(accountKey: AccountKey) {
    super(`${DB_NAME_PREFIX}:${accountKey}`);
    this.version(1).stores({
      messages:
        "&localId, serverId, [accountKey+conversationId], &[accountKey+clientMessageId], [accountKey+conversationId+createdSeq]",
      conversations: "&id, accountKey, [accountKey+updatedAt]",
      drafts: "&id, [accountKey+conversationId]",
      outbox: "&id, accountKey, [accountKey+status+nextAttemptAt], [accountKey+type]",
      syncCursors: "&[accountKey+conversationId]",
    });
    this.version(2).stores({
      voiceUploads: "&id, accountKey",
    });
  }
}

const dbCache = new Map<AccountKey, MessengerDatabase>();

export function openMessengerDatabase(accountKey: AccountKey): MessengerDatabase {
  let db = dbCache.get(accountKey);
  if (!db) {
    db = new MessengerDatabase(accountKey);
    dbCache.set(accountKey, db);
  }
  return db;
}

export async function closeMessengerDatabase(accountKey: AccountKey): Promise<void> {
  const db = dbCache.get(accountKey);
  if (db) {
    dbCache.delete(accountKey);
    await db.close();
  }
}
