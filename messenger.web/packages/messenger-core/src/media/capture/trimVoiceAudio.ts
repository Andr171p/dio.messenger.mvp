export interface AudioRange {
  start: number;
  end: number;
}

export function decodeVoiceAudio(blob: Blob): Promise<AudioBuffer> {
  return blob
    .arrayBuffer()
    .then((data) => new OfflineAudioContext(1, 1, 24_000).decodeAudioData(data));
}

export function getVoiceWaveform(audio: AudioBuffer, range: AudioRange): number[] {
  const samples = audio.getChannelData(0);
  const start = Math.round(range.start * audio.sampleRate);
  const end = Math.min(samples.length, Math.round(range.end * audio.sampleRate));
  const bars = Array.from({ length: 96 }, (_, bar) => {
    const left = start + Math.floor(((end - start) * bar) / 96);
    const right = start + Math.floor(((end - start) * (bar + 1)) / 96);
    let sum = 0;
    for (let frame = left; frame < right; frame++) sum += samples[frame]! ** 2;
    return Math.sqrt(sum / Math.max(1, right - left));
  });
  const peak = Math.max(0.025, ...bars);
  return bars.map((value) => Math.round((value / peak) * 100));
}

export function trimVoiceAudio(
  audio: AudioBuffer,
  range: AudioRange,
  maxBytes: number,
): Blob {
  const start = Math.round(range.start * audio.sampleRate);
  const end = Math.min(audio.length, Math.round(range.end * audio.sampleRate));
  const frames = end - start;
  const pcmBytes = frames * 2;
  if (pcmBytes + 44 > maxBytes) {
    throw new Error(
      "Фрагмент превышает лимит беседы. Выберите более короткий фрагмент.",
    );
  }

  const bytes = new ArrayBuffer(44 + pcmBytes);
  const view = new DataView(bytes);
  const writeTag = (offset: number, tag: string) => {
    for (let i = 0; i < tag.length; i++) view.setUint8(offset + i, tag.charCodeAt(i));
  };
  writeTag(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(36, "data");
  view.setUint32(40, pcmBytes, true);

  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) =>
    audio.getChannelData(channel),
  );
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (const channel of channels) sum += channel[start + frame]!;
    const sample = Math.max(-1, Math.min(1, sum / channels.length));
    view.setInt16(
      44 + frame * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return new Blob([bytes], { type: "audio/wav" });
}
