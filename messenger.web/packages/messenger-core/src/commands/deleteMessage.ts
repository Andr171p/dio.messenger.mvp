import type { AccountKey } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

export interface DeleteMessageInput {
  conversationId: string;
  localId: string;
  /** Current user — only own messages may be deleted client-side */
  authorId: string;
}

export async function deleteMessage(
  db: MessengerDatabase,
  accountKey: AccountKey,
  input: DeleteMessageInput,
): Promise<void> {
  const row = await db.messages.get(input.localId);
  if (!row || row.accountKey !== accountKey) {
    throw new Error("Message not found");
  }
  if (row.authorId !== input.authorId) {
    throw new Error("Cannot delete another user's message");
  }
  if (!row.serverId) {
    throw new Error("Message not acknowledged yet");
  }

  const messageId = row.serverId;
  const previousContent = row.content;
  const now = Date.now();

  await db.transaction("rw", db.messages, db.outbox, async () => {
    await db.messages.put({
      ...row,
      deletedAt: now,
      content: "",
    });
    await db.outbox.put({
      id: crypto.randomUUID(),
      accountKey,
      type: "message.delete",
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      command: {
        type: "message.delete",
        payload: {
          conversationId: input.conversationId,
          messageId,
          localId: input.localId,
          previousContent,
        },
      },
    });
  });
}
