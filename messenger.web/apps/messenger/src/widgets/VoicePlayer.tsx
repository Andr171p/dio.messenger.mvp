import { Icon } from "@dio/messenger-ui";
import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { AudioWaveform } from "./AudioWaveform.js";
import { useMediaSource } from "./useMediaSource.js";
import styles from "./VoicePlayer.module.css";

const RATES = [1, 1.5, 2] as const;

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VoicePlayer({ assetId }: { assetId: string }) {
  const { http } = useRuntime();
  const { metadata } = useMediaSource(assetId);
  const asset = metadata.data;
  const meta = asset?.meta && asset.meta.type === "audio" ? asset.meta : null;
  const durationMs = meta?.durationMs ?? 0;
  const waveform = meta?.waveform ?? [];

  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );

  async function ensureSource(): Promise<string | null> {
    if (src) return src;
    if (!http || loadingRef.current) return null;
    loadingRef.current = true;
    try {
      const blob = await http.request<Blob>(`/v1/media/${assetId}/content`, {
        responseType: "blob",
        timeoutMs: 90_000,
      });
      const url = URL.createObjectURL(blob);
      setSrc(url);
      return url;
    } catch {
      setLoadError(true);
      return null;
    } finally {
      loadingRef.current = false;
    }
  }

  async function togglePlay(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    const url = await ensureSource();
    if (!url) return;
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
    audio.currentTime = fraction * (durationMs / 1000);
    setTimeMs(fraction * durationMs);
  }

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        src={src ?? undefined}
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
        {formatTime(timeMs)} / {formatTime(durationMs)}
      </span>
      <button type="button" className={styles.rate} onClick={cycleRate} aria-label="Скорость">
        {rate}×
      </button>
    </div>
  );
}
