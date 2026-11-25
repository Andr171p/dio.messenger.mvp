import { describe, expect, it, vi } from "vitest";
import {
  blocksToPlainPreview,
  mediaPreviewLabel,
  readMessageBlocks,
} from "../content/blocks.js";
import { resampleWaveform } from "../media/waveform.js";
import {
  listPendingVoiceUploads,
  queueUploadedVoiceMessage,
  removeVoiceRecording,
  resumePendingVoiceUploads,
  saveVoiceRecording,
} from "../commands/voiceUploads.js";
import { openMessengerDatabase } from "../storage/database.js";
import { trimVoiceAudio } from "../media/capture/trimVoiceAudio.js";
import { MediaUploadManager } from "../media/MediaUploadManager.js";
import { HttpError, type HttpClient } from "../transport/httpClient.js";

describe("resampleWaveform", () => {
  it("keeps the same array when barCount matches", () => {
    const samples = [10, 20, 30];
    expect(resampleWaveform(samples, 3)).toEqual(samples);
  });

  it("downsamples by RMS aggregation", () => {
    const samples = [100, 0, 100, 0];
    // RMS пары [100, 0] = sqrt(10000/2) ≈ 71.
    expect(resampleWaveform(samples, 2)).toEqual([71, 71]);
  });

  it("upsamples by linear interpolation", () => {
    const samples = [0, 100];
    const bars = resampleWaveform(samples, 3);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toBe(0);
    expect(bars[2]).toBe(100);
  });

  it("returns zeros for empty input", () => {
    expect(resampleWaveform([], 4)).toEqual([0, 0, 0, 0]);
  });
});

describe("media presentation previews", () => {
  it("labels voice and video_note distinctly", () => {
    expect(mediaPreviewLabel("voice")).toContain("Голосовое");
    expect(mediaPreviewLabel("video_note")).toContain("Видеосообщение");
    expect(mediaPreviewLabel()).toBe("📎 Вложение");
  });

  it("renders voice block in preview text", () => {
    const preview = blocksToPlainPreview([
      { type: "media", assetId: "a", presentation: "voice" },
    ]);
    expect(preview).toContain("Голосовое");
  });

  it("preserves presentation through readMessageBlocks", () => {
    const blocks = readMessageBlocks({
      content: "",
      contentBlocks: JSON.stringify([
        { type: "media", assetId: "asset-1", presentation: "voice" },
      ]),
    });
    expect(blocks).toEqual([
      { type: "media", assetId: "asset-1", presentation: "voice" },
    ]);
  });
});

describe("voiceUploads persistence", () => {
  it("queues one voice message after upload and preserves the text draft", async () => {
    const accountKey = "voice-send";
    const conversationId = "conv-1";
    const db = openMessengerDatabase(accountKey);
    await db.conversations.put({
      accountKey,
      id: conversationId,
      title: "Support",
      unreadCount: 0,
      isGuest: false,
      isPinned: false,
      updatedAt: 1,
    });
    const draft = { accountKey, conversationId, content: "Черновик", updatedAt: 1 };
    await db.drafts.put({ ...draft, id: `${accountKey}::${conversationId}` });
    const id = await saveVoiceRecording(db, accountKey, {
      conversationId,
      blob: new Blob(["audio"], { type: "audio/wav" }),
      contentType: "audio/wav",
      filename: "voice.wav",
      send: { draftReply: { localId: "source", preview: "Цитата" } },
    });

    await Promise.all([
      queueUploadedVoiceMessage(db, accountKey, id, "asset-1", accountKey),
      queueUploadedVoiceMessage(db, accountKey, id, "asset-1", accountKey),
    ]);

    const message = await db.messages.get(id);
    expect(message?.replyToId).toBe("source");
    expect(readMessageBlocks(message!)).toEqual([
      { type: "media", assetId: "asset-1", presentation: "voice" },
    ]);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.voiceUploads.get(id)).toBeUndefined();
    expect(await db.drafts.get(`${accountKey}::${conversationId}`)).toMatchObject(
      draft,
    );
  });

  it("saves, lists and removes pending recordings", async () => {
    const accountKey = "user-1";
    const db = openMessengerDatabase(accountKey);
    const blob = new Blob(["audio"], { type: "audio/webm" });

    const id = await saveVoiceRecording(db, accountKey, {
      conversationId: "conv-1",
      blob,
      contentType: "audio/webm",
      filename: "voice.webm",
    });

    const pending = await listPendingVoiceUploads(db, accountKey);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.conversationId).toBe("conv-1");

    await removeVoiceRecording(db, accountKey, id);
    expect(await listPendingVoiceUploads(db, accountKey)).toHaveLength(0);
  });

  it("resumes pending recordings through the upload manager", async () => {
    const accountKey = "user-1";
    const db = openMessengerDatabase(accountKey);
    const blob = new Blob(["audio"], { type: "audio/webm" });
    const enqueued: Array<{ file: File; presentation: string }> = [];

    await saveVoiceRecording(db, accountKey, {
      conversationId: "conv-2",
      blob,
      contentType: "audio/webm",
      filename: "voice.webm",
    });

    const media = {
      enqueue: async (
        file: File,
        conversationId: string,
        options?: { presentation?: string },
      ) => {
        enqueued.push({ file, presentation: options?.presentation ?? "file" });
        return "job-1";
      },
    };

    await resumePendingVoiceUploads(db, accountKey, media as never);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.presentation).toBe("voice");
    expect(enqueued[0]?.file.name).toBe("voice.webm");
  });
});

it("encodes only the selected PCM frames without including neighbouring audio", async () => {
  const audio = {
    duration: 1,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
    sampleRate: 4,
    length: 4,
    numberOfChannels: 1,
    getChannelData: () => Float32Array.of(1, 0.5, -0.5, -1),
  } as AudioBuffer;
  const range = { start: 0.25, end: 0.75 };
  const wav = trimVoiceAudio(audio, range, 48);
  const bytes = new DataView(await wav.arrayBuffer());

  expect(wav.type).toBe("audio/wav");
  expect(bytes.getUint32(40, true)).toBe(4);
  expect(bytes.getInt16(44, true)).toBe(16384);
  expect(bytes.getInt16(46, true)).toBe(-16384);
  expect(() => trimVoiceAudio(audio, range, 47)).toThrow();
});

it("keeps a voice upload retryable when the API rejects its format", async () => {
  const http = {
    post: vi.fn().mockRejectedValue(
      new HttpError(422, "Unprocessable Entity", {
        errorCode: "media_policy_violation",
        message: "Content type 'audio/wav' is not allowed.",
      }),
    ),
  } as unknown as HttpClient;
  const media = new MediaUploadManager(http);
  await media.enqueue(new File(["voice"], "voice.wav", { type: "audio/wav" }), "chat", {
    presentation: "voice",
  });
  await vi.waitFor(() =>
    expect(media.getJobs()[0]).toMatchObject({
      status: "failed",
      retryable: true,
      error: "Сервер пока не поддерживает формат этой записи",
    }),
  );
});
