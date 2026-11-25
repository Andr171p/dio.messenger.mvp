import { resampleWaveform } from "@dio/messenger-core";
import styles from "./AudioWaveform.module.css";

/**
 * Столбиковая waveform из нормализованных амплитуд (0–100).
 * Один канонический массив адаптируется к любой ширине через `resampleWaveform`.
 * `progress` (0..1) подсвечивает прослушанную часть.
 */
export function AudioWaveform({
  samples,
  progress = 0,
  barCount = 48,
  interactive = false,
  onSeek,
  className = "",
}: {
  samples: number[];
  progress?: number;
  barCount?: number;
  interactive?: boolean;
  onSeek?: (fraction: number) => void;
  className?: string;
}) {
  const bars = resampleWaveform(samples, barCount);
  const playedIndex = Math.round(progress * bars.length);

  function handleSeek(event: React.MouseEvent<HTMLDivElement>) {
    if (!interactive || !onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(fraction);
  }

  return (
    <div
      className={[styles.waveform, interactive ? styles.interactive : "", className].join(" ")}
      role={interactive ? "slider" : undefined}
      aria-label="Голосовое сообщение"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={interactive ? Math.round(progress * 100) : undefined}
      onClick={handleSeek}
    >
      {bars.map((value, index) => (
        <span
          key={index}
          className={index < playedIndex ? styles.barPlayed : styles.bar}
          style={{ height: `${Math.max(8, Math.min(100, value))}%` }}
        />
      ))}
    </div>
  );
}
