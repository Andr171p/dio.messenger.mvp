import type { AccountKey, Draft } from "../models/types.js";
import type { MediaPresentation } from "../content/blocks.js";
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
  threadId?: string,
): Promise<void> {
  const id = conversationKey(accountKey, conversationId, threadId);
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
  presentation?: MediaPresentation,
  threadId?: string,
): Promise<void> {
  await db.transaction("rw", db.drafts, db.conversations, async () => {
    const conversation = await db.conversations.get(conversationId);
    if (conversation?.accountKey !== accountKey) throw new Error("Беседа недоступна");
    const id = conversationKey(accountKey, conversationId, threadId);
    const draft = await db.drafts.get(id);
    const attachments = draft?.attachments ?? [];
    if (
      attachments.some(
        ({ block }) => block.type === "media" && block.assetId === assetId,
      )
    )
      return;
    const block = presentation
      ? { type: "media" as const, assetId, presentation }
      : { type: "media" as const, assetId };
    await db.drafts.put({
      id,
      accountKey,
      conversationId,
      content: "",
      ...draft,
      updatedAt: Date.now(),
      attachments: [...attachments, { label: filename, block }],
    });
  });
}
