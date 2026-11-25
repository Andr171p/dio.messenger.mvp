import type { AccountKey, VoiceUpload } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";
import type { MediaUploadManager } from "../media/MediaUploadManager.js";
import { sendMessage } from "./sendMessage.js";

/**
 * Offline-persist голосовой записи: blob лежит в IndexedDB, пока upload не
 * завершён, и возобновляется после reload/reconnect. После готовности запись
 * удаляется из IndexedDB (см. callback saveReady в RuntimeProvider).
 */

export async function saveVoiceRecording(
  db: MessengerDatabase,
  accountKey: AccountKey,
  input: {
    conversationId: string;
    blob: Blob;
    contentType: string;
    filename: string;
    send?: VoiceUpload["send"];
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const row: VoiceUpload = {
    id,
    accountKey,
    conversationId: input.conversationId,
    blob: input.blob,
    contentType: input.contentType,
    filename: input.filename,
    ...(input.send ? { send: input.send } : {}),
    createdAt: Date.now(),
  };
  await db.voiceUploads.put(row);
  return id;
}

export async function queueUploadedVoiceMessage(
  db: MessengerDatabase,
  accountKey: AccountKey,
  id: string,
  assetId: string,
  authorId: string,
): Promise<void> {
  await db.transaction(
    "rw",
    [db.voiceUploads, db.messages, db.outbox, db.conversations, db.drafts],
    async () => {
      const row = await db.voiceUploads.get(id);
      if (!row?.send || row.accountKey !== accountKey) return;
      const conversation = await db.conversations.get(row.conversationId);
      if (conversation?.accountKey !== accountKey) throw new Error("Беседа недоступна");
      const reply = row.send.draftReply;
      await sendMessage(db, accountKey, {
        conversationId: row.conversationId,
        clientMessageId: id,
        threadId: row.send.threadId,
        authorId,
        content: "",
        extraBlocks: [{ type: "media", assetId, presentation: "voice" }],
        ...(reply
          ? {
              replyToLocalId: reply.localId,
              replyToId: reply.serverId,
              replyPreview: reply.preview,
              quoteText: reply.quoteText,
            }
          : {}),
      });
      await db.voiceUploads.delete(id);
    },
  );
}

export async function removeVoiceRecording(
  db: MessengerDatabase,
  accountKey: AccountKey,
  id: string,
): Promise<void> {
  const row = await db.voiceUploads.get(id);
  if (row && row.accountKey === accountKey) await db.voiceUploads.delete(id);
}

export async function listPendingVoiceUploads(
  db: MessengerDatabase,
  accountKey: AccountKey,
): Promise<VoiceUpload[]> {
  return db.voiceUploads.where("accountKey").equals(accountKey).toArray();
}

export async function resumePendingVoiceUploads(
  db: MessengerDatabase,
  accountKey: AccountKey,
  media: MediaUploadManager,
): Promise<void> {
  const rows = await listPendingVoiceUploads(db, accountKey);
  for (const row of rows) {
    const file = new File([row.blob], row.filename, { type: row.contentType });
    await media.enqueue(file, row.conversationId, {
      presentation: "voice",
      voiceUploadId: row.id,
      sendAsMessage: !!row.send,
    });
  }
}
