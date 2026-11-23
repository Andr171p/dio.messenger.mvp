import type { AccountKey, LocalMessage, SendMessageOutboxCommand } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

export interface SendMessageInput {
  conversationId: string;
  content: string;
  replyToId?: string;
  authorId: string;
  clientMessageId?: string;
}

export async function sendMessage(
  db: MessengerDatabase,
  accountKey: AccountKey,
  input: SendMessageInput,
): Promise<string> {
  const clientMessageId = input.clientMessageId ?? crypto.randomUUID();
  const now = Date.now();
  const outboxId = crypto.randomUUID();

  const message: LocalMessage = {
    accountKey,
    localId: clientMessageId,
    clientMessageId,
    conversationId: input.conversationId,
    content: input.content,
    createdAt: now,
    revision: 1,
    sendStatus: "queued",
    isOutgoing: true,
    authorId: input.authorId,
    ...(input.replyToId !== undefined ? { replyToId: input.replyToId } : {}),
  };

  const command: SendMessageOutboxCommand = {
    conversationId: input.conversationId,
    clientMessageId,
    content: input.content,
    ...(input.replyToId !== undefined ? { replyToId: input.replyToId } : {}),
  };

  await db.transaction("rw", db.messages, db.outbox, db.conversations, async () => {
    await db.messages.put(message);
    await db.outbox.put({
      id: outboxId,
      accountKey,
      type: "message.send",
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      command: { type: "message.send", payload: command },
      createdAt: now,
    });
    const conv = await db.conversations.get(input.conversationId);
    if (conv) {
      await db.conversations.put({
        ...conv,
        lastMessagePreview: input.content.slice(0, 120),
        lastMessageAt: now,
        updatedAt: now,
      });
    }
  });

  return clientMessageId;
}