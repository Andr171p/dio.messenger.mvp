import type { AccountKey, ConversationEvent } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";
import { applyEventProjection } from "./applyEventProjection.js";
import { SyncGapError } from "./errors.js";

export async function applyEvent(
  db: MessengerDatabase,
  accountKey: AccountKey,
  event: ConversationEvent,
): Promise<void> {
  await db.transaction(
    "rw",
    db.messages,
    db.syncCursors,
    db.conversations,
    async () => {
      const cursor = await db.syncCursors.get([accountKey, event.conversationId]);
      const last = cursor?.eventSeq ?? 0;

      if (event.eventSeq <= last) {
        return;
      }
      if (event.eventSeq !== last + 1) {
        throw new SyncGapError(last, event.eventSeq);
      }

      await applyEventProjection(db, accountKey, event);
      await db.syncCursors.put({
        accountKey,
        conversationId: event.conversationId,
        eventSeq: event.eventSeq,
      });
    },
  );
}