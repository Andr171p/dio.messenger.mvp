export type * from "./models/index.js";

export {
  textBlocks,
  parseComposerContent,
  blocksToPlainPreview,
  extractPlainText,
  extractBlocks,
  type ContentBlock,
} from "./content/blocks.js";
export {
  extractTicketResourceId,
  extractTicketNumber,
  DIODESK_PROVIDER,
} from "./content/tickets.js";

export {
  openMessengerDatabase,
  closeMessengerDatabase,
  MessengerDatabase,
} from "./storage/database.js";

export { sendMessage, type SendMessageInput } from "./commands/sendMessage.js";
export { editMessage, type EditMessageInput } from "./commands/editMessage.js";
export { deleteMessage, type DeleteMessageInput } from "./commands/deleteMessage.js";
export {
  toggleReaction,
  type ToggleReactionInput,
} from "./commands/toggleReaction.js";
export { pinMessage, type PinMessageInput } from "./commands/pinMessage.js";
export { markConversationRead } from "./commands/readCursor.js";
export { upsertDraft, clearDraft } from "./commands/drafts.js";

export { applyEvent } from "./sync/applyEvent.js";
export { applyEventProjection } from "./sync/applyEventProjection.js";
export { reconcileSendAck } from "./sync/reconcileAck.js";
export { wipeConversation } from "./sync/wipeConversation.js";
export { SyncGapError, SnapshotRequiredError } from "./sync/errors.js";
export { createSyncEngine, type SyncEngine } from "./sync/syncEngine.js";

export { OutboxProcessor } from "./outbox/outboxProcessor.js";
export { computeBackoffMs } from "./outbox/backoff.js";

export { HttpClient, HttpError } from "./transport/httpClient.js";
export {
  WebSocketClient,
  normalizeDurableEvent,
} from "./transport/websocketClient.js";

export { DioDeskAuthAdapter } from "./auth/DioDeskAuthAdapter.js";
export { MessengerAuthAdapter } from "./auth/MessengerAuthAdapter.js";
export { memoryAuthStore } from "./auth/memoryAuthStore.js";
export type { AuthAdapter, LoginCredentials } from "./auth/types.js";

export { MediaUploadManager } from "./media/MediaUploadManager.js";