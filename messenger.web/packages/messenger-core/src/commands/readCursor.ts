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
  await db.transaction("rw", db.conversations, async () => {
    const conversation = await db.conversations.get(conversationId);
    if (conversation?.accountKey !== accountKey) return;
    const pending = Math.max(
      conversation.pendingReadMessageSeq ?? 0,
      lastReadMessageSeq,
    );
    if (pending > (conversation.lastReadMessageSeq ?? 0)) {
      await db.conversations.update(conversationId, { pendingReadMessageSeq: pending });
    }
  });
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
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
    const next: Conversation = {
      ...conv,
      unreadCount,
      lastReadMessageSeq: readSeq,
      pendingReadMessageSeq:
        (conv.pendingReadMessageSeq ?? 0) > readSeq
          ? conv.pendingReadMessageSeq
          : undefined,
    };
    await db.conversations.put(next);
  });
}
