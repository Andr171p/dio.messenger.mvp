import type { AccountKey } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

export interface PinMessageInput {
  conversationId: string;
  localId: string;
  pin: boolean;
}

export async function pinMessage(
  db: MessengerDatabase,
  accountKey: AccountKey,
  input: PinMessageInput,
): Promise<void> {
  const row = await db.messages.get(input.localId);
  if (!row || row.accountKey !== accountKey) {
    throw new Error("Message not found");
  }
  if (!row.serverId) {
    throw new Error("Message not acknowledged yet");
  }

  const now = Date.now();
  await db.transaction("rw", db.messages, db.outbox, async () => {
    await db.messages.put({ ...row, isPinned: input.pin });
    await db.outbox.put({
      id: crypto.randomUUID(),
      accountKey,
      type: input.pin ? "message.pin" : "message.unpin",
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      command: input.pin
        ? {
            type: "message.pin",
            payload: {
              conversationId: input.conversationId,
              messageId: row.serverId!,
            },
          }
        : {
            type: "message.unpin",
            payload: {
              conversationId: input.conversationId,
              messageId: row.serverId!,
            },
          },
    });
  });
}
