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
  await http.put(`/v1/conversations/${conversationId}/read-cursor`, {
    lastReadMessageSeq,
  });

  const conv = await db.conversations.get(conversationId);
  if (conv && conv.accountKey === accountKey) {
    const next: Conversation = { ...conv, unreadCount: 0 };
    await db.conversations.put(next);
  }
}