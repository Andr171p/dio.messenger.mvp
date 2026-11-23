import { extractPlainText } from "../content/blocks.js";
import type { AccountKey, ConversationEvent, LocalMessage } from "../models/types.js";
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
): Promise<void> {
  const payload = event.payload;

  switch (event.type) {
    case "message.created": {
      const clientMessageId = asString(payload.clientMessageId);
      const messageId = asString(payload.messageId);
      const createdSeq = asNumber(payload.createdSeq) ?? 0;
      const content = extractPlainText(payload.content ?? payload);
      const authorId =
        asString(payload.senderId) ?? asString(payload.authorId) ?? "unknown";
      const createdAt = asNumber(payload.createdAt) ?? Date.now();
      const revision = asNumber(payload.revision) ?? 1;

      if (clientMessageId) {
        const existing = await db.messages
          .where("[accountKey+clientMessageId]")
          .equals([accountKey, clientMessageId])
          .first();
        if (existing) {
          await db.messages.put({
            ...existing,
            serverId: messageId ?? existing.serverId,
            createdSeq,
            revision,
            sendStatus: "sent",
            content: content || existing.content,
            authorId: existing.authorId || authorId,
          });
          return;
        }
      }

      const localId = clientMessageId ?? messageId ?? crypto.randomUUID();
      const isOutgoing = false;
      const authorDisplayName =
        asString(payload.senderDisplayName) ?? asString(payload.authorName);
      const message: LocalMessage = {
        accountKey,
        localId,
        clientMessageId: clientMessageId ?? localId,
        conversationId: event.conversationId,
        serverId: messageId,
        content,
        createdAt,
        createdSeq,
        revision,
        sendStatus: "sent",
        isOutgoing,
        authorId,
        ...(authorDisplayName ? { authorDisplayName } : {}),
        ...(asString(payload.replyToId)
          ? { replyToId: asString(payload.replyToId) }
          : {}),
      };
      await db.messages.put(message);

      const conv = await db.conversations.get(event.conversationId);
      await db.conversations.put({
        accountKey,
        id: event.conversationId,
        title: conv?.title ?? event.conversationId,
        lastMessagePreview: content.slice(0, 120),
        lastMessageAt: createdAt,
        unreadCount: conv?.unreadCount ?? 0,
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
        content: extractPlainText(payload.content ?? payload) || row.content,
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
