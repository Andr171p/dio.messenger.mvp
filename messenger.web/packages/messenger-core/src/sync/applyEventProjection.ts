import { projectContent, projectMessage } from "./projectMessage.js";
import type { AccountKey, ConversationEvent } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export async function applyEventProjection(
  db: MessengerDatabase,
  accountKey: AccountKey,
  event: ConversationEvent,
  currentUserId?: string,
): Promise<void> {
  const payload = event.payload;

  switch (event.type) {
    case "message.created": {
      const message = projectMessage(
        {
          id: asString(payload.messageId),
          clientMessageId: asString(payload.clientMessageId),
          senderId:
            asString(payload.senderId) ?? asString(payload.authorId) ?? "unknown",
          senderDisplayName:
            asString(payload.senderDisplayName) ?? asString(payload.authorName),
          createdSeq: asNumber(payload.createdSeq) ?? 0,
          createdAt: asNumber(payload.createdAt) ?? asString(payload.createdAt),
          revision: asNumber(payload.revision),
          content: payload.content ?? payload,
          replyToId: asString(payload.replyToId),
        },
        accountKey,
        event.conversationId,
        currentUserId,
      );
      const existing = await db.messages.get(message.localId);
      if (existing && existing.revision > message.revision) return;
      const { content, createdAt } = message;
      await db.messages.put({
        ...existing,
        ...message,
        isOutgoing: message.isOutgoing || existing?.isOutgoing === true,
      });

      const conv = await db.conversations.get(event.conversationId);
      await db.conversations.put({
        accountKey,
        id: event.conversationId,
        title: conv?.title ?? event.conversationId,
        lastMessagePreview: content.slice(0, 120),
        lastMessageAt: createdAt,
        unreadCount:
          (conv?.unreadCount ?? 0) + (message.isOutgoing || existing ? 0 : 1),
        isGuest: conv?.isGuest ?? false,
        hasExternalMembers: conv?.hasExternalMembers,
        kind: conv?.kind,
        memberCount: conv?.memberCount,
        isPinned: conv?.isPinned ?? false,
        updatedAt: createdAt,
      });
      break;
    }
    case "message.edited": {
      const messageId = asString(payload.messageId);
      if (!messageId) return;
      const row =
        (await db.messages.where("serverId").equals(messageId).first()) ??
        (await db.messages.where("localId").equals(messageId).first());
      if (!row || row.accountKey !== accountKey) return;
      await db.messages.put({
        ...row,
        ...projectContent(payload.content ?? payload),
        revision: asNumber(payload.revision) ?? row.revision + 1,
      });
      break;
    }
    case "message.deleted": {
      const messageId = asString(payload.messageId);
      if (!messageId) return;
      const row = await db.messages.where("serverId").equals(messageId).first();
      if (!row || row.accountKey !== accountKey) return;
      await db.messages.put({
        ...row,
        deletedAt: Date.now(),
        contentBlocks: undefined,
        quoteText: undefined,
        forwardedFrom: undefined,
        content: "",
      });
      break;
    }
    case "reaction.added":
    case "reaction.removed": {
      const messageId = asString(payload.messageId);
      const emoji = asString(payload.emoji);
      const userId = asString(payload.userId) ?? asString(payload.principalId);
      if (!messageId || !emoji || !userId) return;
      const row = await db.messages.where("serverId").equals(messageId).first();
      if (!row || row.accountKey !== accountKey) return;
      const reactions = { ...(row.reactions ?? {}) };
      const users = new Set(reactions[emoji] ?? []);
      if (event.type === "reaction.added") {
        users.add(userId);
      } else {
        users.delete(userId);
      }
      if (users.size === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = [...users];
      }
      await db.messages.put({ ...row, reactions });
      break;
    }
    case "message.pinned":
    case "message.unpinned": {
      const messageId = asString(payload.messageId);
      if (!messageId) return;
      const row = await db.messages.where("serverId").equals(messageId).first();
      if (!row || row.accountKey !== accountKey) return;
      await db.messages.put({
        ...row,
        isPinned: event.type === "message.pinned",
      });
      break;
    }
    case "conversation.updated": {
      const conv = await db.conversations.get(event.conversationId);
      await db.conversations.put({
        accountKey,
        id: event.conversationId,
        title: asString(payload.title) ?? conv?.title ?? event.conversationId,
        lastMessagePreview: conv?.lastMessagePreview,
        lastMessageAt: conv?.lastMessageAt,
        unreadCount: conv?.unreadCount ?? 0,
        isGuest:
          payload.isGuest === true ||
          payload.hasExternalMembers === true ||
          conv?.isGuest === true,
        hasExternalMembers:
          payload.hasExternalMembers === true || conv?.hasExternalMembers,
        kind: conv?.kind,
        memberCount: conv?.memberCount,
        isPinned: conv?.isPinned ?? false,
        updatedAt: Date.now(),
      });
      break;
    }
    default:
      break;
  }
}
