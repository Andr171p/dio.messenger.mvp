import type { AccountKey } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

export interface EditMessageInput {
  conversationId: string;
  localId: string;
  content: string;
}

export async function editMessage(
  db: MessengerDatabase,
  accountKey: AccountKey,
  input: EditMessageInput,
): Promise<void> {
  const row = await db.messages.get(input.localId);
  if (!row || row.accountKey !== accountKey) {
    throw new Error("Message not found");
  }

  const messageId = row.serverId ?? row.localId;
  const now = Date.now();
  const nextRevision = row.revision + 1;

  await db.transaction("rw", db.messages, db.outbox, async () => {
    await db.messages.put({
      ...row,
      content: input.content,
      revision: nextRevision,
    });
    await db.outbox.put({
      id: crypto.randomUUID(),
      accountKey,
      type: "message.edit",
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      command: {
        type: "message.edit",
        payload: {
          conversationId: input.conversationId,
          messageId,
          content: input.content,
          expectedRevision: nextRevision,
        },
      },
    });
  });
}