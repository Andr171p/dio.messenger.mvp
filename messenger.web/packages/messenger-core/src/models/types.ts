export type AccountKey = string;

export type MessageSendStatus =
  | "queued"
  | "sending"
  | "sent"
  | "retrying"
  | "failed";

export type OutboxStatus = "pending" | "processing" | "done" | "failed";

export type OutboxOperationType =
  | "message.send"
  | "message.edit"
  | "message.delete"
  | "reaction.toggle";

export interface LocalMessage {
  accountKey: AccountKey;
  localId: string;
  clientMessageId: string;
  conversationId: string;
  serverId?: string;
  content: string;
  createdAt: number;
  createdSeq?: number;
  revision: number;
  replyToId?: string;
  sendStatus: MessageSendStatus;
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
  lastMessagePreview?: string;
  lastMessageAt?: number;
  unreadCount: number;
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
  updatedAt: number;
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
  conversationId: string;
  clientMessageId: string;
  content: string;
  replyToId?: string;
}

export type OutboxCommandPayload =
  | { type: "message.send"; payload: SendMessageOutboxCommand }
  | { type: "message.edit"; payload: { conversationId: string; messageId: string; content: string; expectedRevision: number } }
  | { type: "message.delete"; payload: { conversationId: string; messageId: string } }
  | { type: "reaction.toggle"; payload: { conversationId: string; messageId: string; emoji: string } };

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
  | "conversation.updated";

export interface ConversationEvent {
  conversationId: string;
  eventSeq: number;
  eventId: string;
  type: ConversationEventType;
  payload: Record<string, unknown>;
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
  | "idle"
  | "starting"
  | "syncing"
  | "connected"
  | "disconnected"
  | "error";

export interface SyncStatus {
  runtime: SyncRuntimeStatus;
  lastSyncAt?: number;
  lastError?: string;
  wsConnected: boolean;
}