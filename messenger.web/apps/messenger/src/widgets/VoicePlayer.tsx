import { Icon } from "@dio/messenger-ui";
import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { AudioWaveform } from "./AudioWaveform.js";
import { formatVoiceTime } from "./formatVoiceTime.js";
import { useMediaSource } from "./useMediaSource.js";
import styles from "./VoicePlayer.module.css";

const RATES = [1, 1.5, 2] as const;

export function VoicePlayer({ assetId }: { assetId: string }) {
  const { http } = useRuntime();
  const { metadata } = useMediaSource(assetId);
  const asset = metadata.data;
  const meta = asset?.meta && asset.meta.type === "audio" ? asset.meta : null;
  const durationMs = meta?.durationMs ?? 0;
  const waveform = meta?.waveform ?? [];

  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const source = useRef<string | null>(null);
  const loading = useRef<AbortController | null>(null);
  const pendingSeek = useRef(0);

  useEffect(
    () => () => {
      loading.current?.abort();
      if (source.current) URL.revokeObjectURL(source.current);
      source.current = null;
    },
    [],
  );

  async function loadSource(audio: HTMLAudioElement): Promise<boolean> {
    if (source.current) return true;
    if (!http || loading.current) return false;
    const controller = new AbortController();
    loading.current = controller;
    try {
      const blob = await http.request<Blob>(`/v1/media/${assetId}/content`, {
        responseType: "blob",
        timeoutMs: 90_000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      source.current = URL.createObjectURL(blob);
      audio.src = source.current;
      audio.currentTime = pendingSeek.current;
      return true;
    } catch {
      if (!controller.signal.aborted) setLoadError(true);
      return false;
    } finally {
      loading.current = null;
    }
  }

  async function togglePlay(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (!(await loadSource(audio))) return;
    audio.playbackRate = rate;
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  function cycleRate(): void {
    const index = RATES.indexOf(rate);
    const next = RATES[(index + 1) % RATES.length]!;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  function seek(fraction: number): void {
    const audio = audioRef.current;
    if (!audio || !durationMs) return;
    pendingSeek.current = fraction * (durationMs / 1000);
    if (source.current) audio.currentTime = pendingSeek.current;
    setTimeMs(fraction * durationMs);
  }

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTimeMs(event.currentTarget.currentTime * 1000)}
        preload="none"
      />
      <button
        type="button"
        className={styles.playButton}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
        onClick={() => void togglePlay()}
        disabled={loadError}
      >
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
      <AudioWaveform
        samples={waveform}
        progress={durationMs ? timeMs / durationMs : 0}
        interactive
        onSeek={seek}
      />
      <span className={styles.time}>
        {formatVoiceTime(timeMs / 1000)} /{" "}
        {formatVoiceTime(Math.round(durationMs / 1000))}
      </span>
      <button
        type="button"
        className={styles.rate}
        onClick={cycleRate}
        aria-label="Скорость"
      >
        {rate}×
      </button>
    </div>
  );
}
