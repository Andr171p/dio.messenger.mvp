import type { AccountKey, Draft } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";
import { conversationKey } from "../storage/keys.js";

export async function upsertDraft(
  db: MessengerDatabase,
  accountKey: AccountKey,
  conversationId: string,
  content: string,
  replyToId?: string,
  draftReply?: Draft["draftReply"],
  attachments?: Draft["attachments"],
  mentionTokens?: Draft["mentionTokens"],
): Promise<void> {
  const id = conversationKey(accountKey, conversationId);
  if (!content.trim() && !draftReply && !attachments?.length) {
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
    ...(draftReply ? { draftReply } : {}),
    attachments,
    mentionTokens,
  });
}

export async function clearDraft(
  db: MessengerDatabase,
  accountKey: AccountKey,
  conversationId: string,
): Promise<void> {
  await db.drafts.delete(conversationKey(accountKey, conversationId));
}

export async function saveDraftUpload(
  db: MessengerDatabase,
  accountKey: AccountKey,
  conversationId: string,
  assetId: string,
  filename: string,
): Promise<void> {
  await db.transaction("rw", db.drafts, db.conversations, async () => {
    const conversation = await db.conversations.get(conversationId);
    if (conversation?.accountKey !== accountKey) throw new Error("Беседа недоступна");
    const id = conversationKey(accountKey, conversationId);
    const draft = await db.drafts.get(id);
    const attachments = draft?.attachments ?? [];
    if (
      attachments.some(
        ({ block }) => block.type === "media" && block.assetId === assetId,
      )
    )
      return;
    await db.drafts.put({
      id,
      accountKey,
      conversationId,
      content: "",
      ...draft,
      updatedAt: Date.now(),
      attachments: [
        ...attachments,
        { label: filename, block: { type: "media", assetId } },
      ],
    });
  });
}
