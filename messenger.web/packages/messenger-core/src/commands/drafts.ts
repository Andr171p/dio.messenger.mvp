import type { AccountKey } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";
import { conversationKey } from "../storage/keys.js";

export async function upsertDraft(
  db: MessengerDatabase,
  accountKey: AccountKey,
  conversationId: string,
  content: string,
  replyToId?: string,
): Promise<void> {
  const id = conversationKey(accountKey, conversationId);
  if (!content.trim()) {
    await db.drafts.delete(id);
    return;
  }
  await db.drafts.put({
    id,
    accountKey,
    conversationId,
    content,
    updatedAt: Date.now(),
    ...(replyToId !== undefined ? { replyToId } : {}),
  });
}

export async function clearDraft(
  db: MessengerDatabase,
  accountKey: AccountKey,
  conversationId: string,
): Promise<void> {
  await db.drafts.delete(conversationKey(accountKey, conversationId));
}