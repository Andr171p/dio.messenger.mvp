import type { HttpClient } from "../transport/httpClient.js";
import type { AccountKey, Conversation } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

export async function markConversationRead(
  db: MessengerDatabase,
  http: HttpClient,
  accountKey: AccountKey,
  conversationId: string,
  lastReadMessageSeq: number,
): Promise<void> {
  const receipt = await http.put<{ lastReadMessageSeq: number }>(
    `/v1/conversations/${conversationId}/read-cursor`,
    {
      lastReadMessageSeq,
    },
  );

  await db.transaction("rw", db.conversations, db.messages, async () => {
    const conv = await db.conversations.get(conversationId);
    if (conv?.accountKey !== accountKey) return;
    const readSeq = Math.max(conv.lastReadMessageSeq ?? 0, receipt.lastReadMessageSeq);
    const unreadCount = await db.messages
      .where("[accountKey+conversationId+createdSeq]")
      .between(
        [accountKey, conversationId, readSeq],
        [accountKey, conversationId, Number.MAX_SAFE_INTEGER],
        false,
        true,
      )
      .filter((message) => !message.isOutgoing && !message.deletedAt)
      .count();
    const next: Conversation = { ...conv, unreadCount, lastReadMessageSeq: readSeq };
    await db.conversations.put(next);
  });
}
