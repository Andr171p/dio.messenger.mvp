export type * from "./models/index.js";
export type { PollState } from "./models/poll.js";
export type { components } from "./transport/generated/messenger-api.js";

export {
  textBlocks,
  parseComposerContent,
  readMessageBlocks,
  blocksToPlainPreview,
  mediaPreviewLabel,
  extractPlainText,
  extractBlocks,
  type ContentBlock,
  type MediaPresentation,
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
export { toggleReaction, type ToggleReactionInput } from "./commands/toggleReaction.js";
export { pinMessage, type PinMessageInput } from "./commands/pinMessage.js";
export { markConversationRead } from "./commands/readCursor.js";
export { conversationKey } from "./storage/keys.js";
export { upsertDraft, clearDraft, saveDraftUpload } from "./commands/drafts.js";
export {
  saveVoiceRecording,
  queueUploadedVoiceMessage,
  removeVoiceRecording,
  listPendingVoiceUploads,
  resumePendingVoiceUploads,
} from "./commands/voiceUploads.js";

export { applyEvent } from "./sync/applyEvent.js";
export { applyEventProjection } from "./sync/applyEventProjection.js";
export { reconcileSendAck } from "./sync/reconcileAck.js";
export { wipeConversation } from "./sync/wipeConversation.js";
export { SyncGapError, SnapshotRequiredError } from "./sync/errors.js";
export { createSyncEngine, type SyncEngine } from "./sync/syncEngine.js";

export { OutboxProcessor } from "./outbox/outboxProcessor.js";
export { computeBackoffMs } from "./outbox/backoff.js";

export { HttpClient, HttpError } from "./transport/httpClient.js";
export { WebSocketClient, normalizeDurableEvent } from "./transport/websocketClient.js";

export { DioDeskAuthAdapter } from "./auth/DioDeskAuthAdapter.js";
export { MessengerAuthAdapter } from "./auth/MessengerAuthAdapter.js";
export { memoryAuthStore } from "./auth/memoryAuthStore.js";
export type { AuthAdapter, LoginCredentials } from "./auth/types.js";

export {
  getInlineMediaPresentation,
  MediaUploadManager,
  type MediaUploadJob,
} from "./media/MediaUploadManager.js";
export { createAudioRecorder } from "./media/capture/audioRecorder.js";
export type {
  AudioRecorder,
  VoiceRecordingResult,
} from "./media/capture/audioRecorder.js";
export { resampleWaveform } from "./media/waveform.js";
export {
  decodeVoiceAudio,
  getVoiceWaveform,
  trimVoiceAudio,
  type AudioRange,
} from "./media/capture/trimVoiceAudio.js";
