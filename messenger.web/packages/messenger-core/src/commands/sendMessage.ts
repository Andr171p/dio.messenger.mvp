import type {
  AccountKey,
  ForwardedFrom,
  LocalMessage,
  SendMessageOutboxCommand,
} from "../models/types.js";
import {
  blocksToPlainPreview,
  parseComposerContent,
  type ContentBlock,
} from "../content/blocks.js";
import type { MessengerDatabase } from "../storage/database.js";
import { conversationKey } from "../storage/keys.js";

export interface SendMessageInput {
  threadId?: string;
  conversationId: string;
  content: string;
  extraBlocks?: ContentBlock[];
  clearConversationDraft?: boolean;
  /** Prefer server UUID; if localId of pending message, set replyToLocalId */
  replyToId?: string;
  replyToLocalId?: string;
  replyPreview?: string;
  quoteText?: string;
  mentions?: string[];
  mentionAll?: boolean;
  forwardedFrom?: ForwardedFrom;
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
  const blocks = [
    ...(input.content.trim() ? parseComposerContent(input.content) : []),
    ...(input.extraBlocks ?? []),
  ];
  if (!blocks.length) throw new Error("Message content is empty");
  const preview = blocksToPlainPreview(blocks);

  let replyToServerId = input.replyToId;
  let replyToLocalId = input.replyToLocalId;
  if (replyToServerId && !looksLikeUuid(replyToServerId)) {
    replyToLocalId = replyToServerId;
    const parent = await db.messages.get(replyToServerId);
    replyToServerId = parent?.serverId;
  } else if (replyToLocalId) {
    const parent = await db.messages.get(replyToLocalId);
    replyToServerId = parent?.serverId;
  }

  const message: LocalMessage = {
    accountKey,
    localId: clientMessageId,
    clientMessageId,
    conversationId: input.conversationId,
    threadId: input.threadId,
    content: preview,
    contentBlocks: JSON.stringify(blocks),
    createdAt: now,
    revision: 1,
    sendStatus: "queued",
    deliveryStatus: "sent",
    isOutgoing: true,
    authorId: input.authorId,
    ...(replyToServerId || replyToLocalId
      ? { replyToId: replyToServerId ?? replyToLocalId }
      : {}),
    ...(input.replyPreview ? { replyPreview: input.replyPreview } : {}),
    ...(input.quoteText ? { quoteText: input.quoteText } : {}),
    ...(input.forwardedFrom ? { forwardedFrom: input.forwardedFrom } : {}),
    ...(input.mentions ? { mentions: input.mentions } : {}),
    ...(input.mentionAll ? { mentionAll: true } : {}),
  };

  const command: SendMessageOutboxCommand = {
    conversationId: input.conversationId,
    threadId: input.threadId,
    clientMessageId,
    content: input.content,
    blocksJson: JSON.stringify(blocks),
    ...(replyToServerId ? { replyToId: replyToServerId } : {}),
    ...(replyToLocalId ? { replyToLocalId } : {}),
    ...(input.mentions ? { mentions: input.mentions } : {}),
    ...(input.mentionAll ? { mentionAll: true } : {}),
    ...(input.forwardedFrom ? { forwardedFrom: input.forwardedFrom } : {}),
    ...(input.quoteText ? { quoteText: input.quoteText } : {}),
  };

  await db.transaction(
    "rw",
    db.messages,
    db.outbox,
    db.conversations,
    db.drafts,
    async () => {
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
          lastMessagePreview: preview.slice(0, 120),
          lastMessageAt: now,
          updatedAt: now,
        });
      }
      if (input.clearConversationDraft) {
        await db.drafts.delete(
          conversationKey(accountKey, input.conversationId, input.threadId),
        );
      }
    },
  );

  return clientMessageId;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
