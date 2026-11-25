export type AccountKey = string;

export type MessageSendStatus = "queued" | "sending" | "sent" | "retrying" | "failed";

export type OutboxStatus = "pending" | "processing" | "done" | "failed";

export type OutboxOperationType =
  | "message.send"
  | "message.edit"
  | "message.delete"
  | "reaction.add"
  | "reaction.remove"
  | "message.pin"
  | "message.unpin"
  | "reaction.toggle";

export interface ForwardedFrom {
  conversationId: string;
  messageId: string;
  text?: string;
}

export interface LocalMessage {
  accountKey: AccountKey;
  localId: string;
  clientMessageId: string;
  conversationId: string;
  threadId?: string;
  serverId?: string;
  content: string;
  /** Serialized content blocks JSON when richer than plain text */
  contentBlocks?: string;
  createdAt: number;
  createdSeq?: number;
  revision: number;
  replyToId?: string;
  replyPreview?: string;
  quoteText?: string;
  forwardedFrom?: ForwardedFrom;
  mentions?: string[];
  mentionAll?: boolean;
  isPinned?: boolean;
  sendStatus: MessageSendStatus;
  sendError?: string;
  deliveryStatus?: "sent" | "delivered" | "read";
  isOutgoing: boolean;
  authorId: string;
  authorDisplayName?: string;
  deletedAt?: number;
  reactions?: Record<string, string[]>;
}

export type ConversationKind = "direct" | "group";

export interface Conversation {
  accountKey: AccountKey;
  id: string;
  title: string;
  peerId?: string;
  description?: string;
  avatarUrl?: string;
  lastMessagePreview?: string;
  lastMessageAt?: number;
  unreadCount: number;
  lastReadMessageSeq?: number;
  isGuest: boolean;
  hasExternalMembers?: boolean;
  kind?: ConversationKind;
  memberCount?: number;
  isPinned: boolean;
  updatedAt: number;
}

export interface Draft {
  id: string;
  accountKey: AccountKey;
  conversationId: string;
  content: string;
  replyToId?: string;
  editingMessageId?: string;
  draftReply?: {
    localId: string;
    serverId?: string;
    preview: string;
    quoteText?: string;
  };
  attachments?: { label: string; block: import("../content/blocks.js").ContentBlock }[];
  mentionTokens?: Record<string, string>;
  updatedAt: number;
}

/** Незавершённая голосовая запись, ждущая upload (offline-persist в IndexedDB). */
export interface VoiceUpload {
  id: string;
  accountKey: AccountKey;
  conversationId: string;
  blob: Blob;
  contentType: string;
  filename: string;
  send?: Pick<Draft, "draftReply"> & { threadId?: string };
  createdAt: number;
}

export interface OutboxItem {
  id: string;
  accountKey: AccountKey;
  type: OutboxOperationType;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil?: number;
  lastError?: string;
  command: OutboxCommandPayload;
  createdAt: number;
}

export interface SendMessageOutboxCommand {
  threadId?: string;
  conversationId: string;
  clientMessageId: string;
  content: string;
  /** Server message UUID; may be unresolved until parent ACK */
  replyToId?: string;
  replyToLocalId?: string;
  mentions?: string[];
  mentionAll?: boolean;
  forwardedFrom?: ForwardedFrom;
  quoteText?: string;
  blocksJson?: string;
}

export type OutboxCommandPayload =
  | { type: "message.send"; payload: SendMessageOutboxCommand }
  | {
      type: "message.edit";
      payload: {
        conversationId: string;
        messageId: string;
        content: string;
        expectedRevision: number;
        blocksJson?: string;
      };
    }
  | {
      type: "message.delete";
      payload: {
        conversationId: string;
        messageId: string;
        localId: string;
        previousContent: string;
      };
    }
  | {
      type: "reaction.toggle";
      payload: {
        conversationId: string;
        messageId: string;
        emoji: string;
        remove?: boolean;
      };
    }
  | {
      type: "reaction.add";
      payload: { conversationId: string; messageId: string; emoji: string };
    }
  | {
      type: "reaction.remove";
      payload: { conversationId: string; messageId: string; emoji: string };
    }
  | { type: "message.pin"; payload: { conversationId: string; messageId: string } }
  | { type: "message.unpin"; payload: { conversationId: string; messageId: string } };

export interface SyncCursor {
  accountKey: AccountKey;
  conversationId: string;
  eventSeq: number;
}

export type ConversationEventType =
  | "message.created"
  | "message.edited"
  | "message.deleted"
  | "reaction.added"
  | "reaction.removed"
  | "message.pinned"
  | "message.unpinned"
  | "member.joined"
  | "member.removed"
  | "conversation.updated"
  | string;

export interface ConversationEvent {
  conversationId: string;
  eventSeq: number;
  eventId: string;
  type: ConversationEventType;
  payload: Record<string, unknown>;
  /** Compact WS notify — pull HTTP delta before advancing cursor */
  compact?: boolean;
}

export interface PresenceState {
  userId: string;
  status: "online" | "offline";
  lastSeenAt?: number;
}

export type ConversationActivity = "typing" | "recording_audio";

export interface TypingState {
  conversationId: string;
  userIds: string[];
  updatedAt: number;
}

export interface SendMessageAck {
  messageId: string;
  clientMessageId: string;
  createdSeq: number;
  eventSeq: number;
}

export interface SyncManifestEntry {
  conversationId: string;
  lastEventSeq: number;
  historyFromSeq?: number;
  lastReadMessageSeq?: number;
  lastDeliveredMessageSeq?: number;
  title?: string;
  isGuest?: boolean;
}

export interface SyncManifest {
  conversations: SyncManifestEntry[];
}

export interface ConversationEventsPage {
  events: ConversationEvent[];
  hasMore: boolean;
  snapshotRequired?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthSession {
  userId: string;
  accountKey: AccountKey;
  tenantId?: string;
  displayName?: string;
}

export type SyncRuntimeStatus =
  "idle" | "starting" | "syncing" | "connected" | "disconnected" | "error";

export interface SyncStatus {
  runtime: SyncRuntimeStatus;
  lastSyncAt?: number;
  lastError?: string;
  wsConnected: boolean;
}
