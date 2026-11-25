import { resampleWaveform } from "@dio/messenger-core";
import { useEffect, useRef, useState } from "react";
import styles from "./AudioWaveform.module.css";

export function AudioWaveform({
  samples,
  progress = 0,
  selection,
  barCount = 48,
  interactive = false,
  onSeek,
  className = "",
}: {
  samples: number[];
  progress?: number;
  selection?: readonly [number, number];
  barCount?: number;
  interactive?: boolean;
  onSeek?: (fraction: number) => void;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const bars = resampleWaveform(
    samples,
    width ? Math.min(barCount, Math.max(1, Math.floor(width / 4))) : barCount,
  );
  const position = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={element}
      className={[
        styles.waveform,
        interactive ? styles.interactive : "",
        className,
      ].join(" ")}
      role={interactive ? "slider" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-hidden={!interactive || undefined}
      aria-label={interactive ? "Позиция воспроизведения" : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(position * 100) : undefined}
      onClick={(event) => {
        if (!interactive) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width)
          onSeek?.(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      }}
      onKeyDown={(event) => {
        if (!interactive) return;
        const next = {
          Home: 0,
          End: 1,
          ArrowLeft: position - 0.05,
          ArrowDown: position - 0.05,
          ArrowRight: position + 0.05,
          ArrowUp: position + 0.05,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        onSeek?.(Math.max(0, Math.min(1, next)));
      }}
    >
      {bars.map((value, index) => {
        const time = (index + 0.5) / bars.length;
        const selected = selection && time >= selection[0] && time <= selection[1];
        return (
          <span
            key={index}
            className={styles.bar}
            data-tone={
              (!selection || selected) && time < position
                ? "played"
                : selected
                  ? "selected"
                  : undefined
            }
            style={{ height: `${Math.max(3, (value / 100) * 26)}px` }}
          />
        );
      })}
    </div>
  );
}
