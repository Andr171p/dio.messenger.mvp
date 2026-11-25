import { describe, expect, it } from "vitest";
import {
  blocksToPlainPreview,
  mediaPreviewLabel,
  readMessageBlocks,
} from "../content/blocks.js";
import { resampleWaveform } from "../media/waveform.js";
import {
  listPendingVoiceUploads,
  removeVoiceRecording,
  resumePendingVoiceUploads,
  saveVoiceRecording,
} from "../commands/voiceUploads.js";
import { openMessengerDatabase } from "../storage/database.js";

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
