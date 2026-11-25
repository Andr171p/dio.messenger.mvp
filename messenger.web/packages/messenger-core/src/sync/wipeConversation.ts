import type { AccountKey } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

/**
 * Wipe local projection for a conversation (access.revoked / left manifest).
 * Preserves outbox items for other conversations.
 */
export async function wipeConversation(
  db: MessengerDatabase,
  accountKey: AccountKey,
  conversationId: string,
): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.messages,
      db.conversations,
      db.drafts,
      db.outbox,
      db.syncCursors,
      db.voiceUploads,
    ],
    async () => {
      await db.messages
        .where("[accountKey+conversationId]")
        .equals([accountKey, conversationId])
        .delete();

      await db.drafts
        .where("[accountKey+conversationId]")
        .equals([accountKey, conversationId])
        .delete();

      await db.voiceUploads
        .where("accountKey")
        .equals(accountKey)
        .and((upload) => upload.conversationId === conversationId)
        .delete();

      const outboxItems = await db.outbox
        .where("accountKey")
        .equals(accountKey)
        .toArray();
      for (const item of outboxItems) {
        const payload = item.command.payload as { conversationId?: string };
        if (payload.conversationId === conversationId) {
          await db.outbox.delete(item.id);
        }
      }

      await db.syncCursors.delete([accountKey, conversationId]);
      await db.conversations.delete(conversationId);
    },
  );
}
