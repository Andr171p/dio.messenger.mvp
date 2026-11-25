import { extractBlocks, extractPlainText } from "../content/blocks.js";
import type { AccountKey, LocalMessage } from "../models/types.js";

export interface ServerMessage {
  id?: string;
  clientMessageId?: string;
  senderId: string;
  createdSeq: number;
  createdAt?: string | number;
  deletedAt?: string | number | null;
  revision?: number;
  content?: unknown;
  threadId?: string | null;
  replyToId?: string | null;
  senderDisplayName?: string;
  reactions?: Record<string, string[]> | null;
}

function timestamp(value?: string | number | null) {
  const time = typeof value === "string" ? Date.parse(value) : value;
  return time != null && Number.isFinite(time) ? time : undefined;
}

export function projectContent(content: unknown): Partial<LocalMessage> {
  const metadata = (content ?? {}) as Record<string, unknown>;
  const blocks = extractBlocks(content);
  const forward = metadata.forwardedFrom as Record<string, unknown> | undefined;
  return {
    content: extractPlainText(content),
    contentBlocks: blocks.length ? JSON.stringify(blocks) : undefined,
    quoteText: typeof metadata.quoteText === "string" ? metadata.quoteText : undefined,
    forwardedFrom:
      typeof forward?.conversationId === "string" &&
      typeof forward.messageId === "string"
        ? {
            conversationId: forward.conversationId,
            messageId: forward.messageId,
            text: typeof forward.text === "string" ? forward.text : undefined,
          }
        : undefined,
  };
}

export function projectMessage(
  message: ServerMessage,
  accountKey: AccountKey,
  conversationId: string,
  userId?: string,
): LocalMessage {
  const localId = message.clientMessageId ?? message.id ?? crypto.randomUUID();
  return {
    ...projectContent(message.content),
    accountKey,
    conversationId,
    localId,
    clientMessageId: localId,
    serverId: message.id,
    content: message.deletedAt ? "" : extractPlainText(message.content),
    createdAt: timestamp(message.createdAt) ?? Date.now(),
    deletedAt: timestamp(message.deletedAt),
    createdSeq: message.createdSeq,
    revision: message.revision ?? 1,
    threadId: message.threadId ?? undefined,
    replyToId: message.replyToId ?? undefined,
    sendStatus: "sent",
    isOutgoing: message.senderId === userId,
    authorId: message.senderId,
    authorDisplayName: message.senderDisplayName,
    ...(message.reactions ? { reactions: message.reactions } : {}),
  };
}
