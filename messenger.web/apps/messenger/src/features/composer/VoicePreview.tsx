import {
  getVoiceWaveform,
  trimVoiceAudio,
  type AudioRange,
  type VoiceRecordingResult,
} from "@dio/messenger-core";
import { IconButton } from "@dio/messenger-ui";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AudioWaveform } from "../../widgets/AudioWaveform.js";
import { formatVoiceTime } from "../../widgets/formatVoiceTime.js";
import styles from "./VoiceRecorder.module.css";

function extension(mimeType: string) {
  if (mimeType.startsWith("audio/mp4")) return "m4a";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  if (mimeType === "audio/wav") return "wav";
  return "webm";
}

export function VoicePreview({
  recording,
  maxBytes,
  onDelete,
  onSubmit,
  actionSlot,
}: {
  recording: VoiceRecordingResult & { audio: AudioBuffer | null; waveform: number[] };
  maxBytes: number;
  onDelete: () => void;
  onSubmit: (file: File) => Promise<void>;
  actionSlot: RefObject<HTMLDivElement | null>;
}) {
  const duration = recording.durationMs / 1000;
  const [applied, setApplied] = useState({ start: 0, end: duration });
  const [draft, setDraft] = useState<AudioRange | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const source = useRef<{ range: AudioRange; blob: Blob; url: string } | null>(null);
  const trimButton = useRef<HTMLDivElement>(null);
  const trimStart = useRef<HTMLInputElement>(null);
  const range = draft ?? applied;
  const length = range.end - range.start;
  const canTrim = !!recording.audio && duration > 0.5;
  const waveform = useMemo(
    () =>
      recording.audio && (applied.start > 0 || applied.end < duration)
        ? getVoiceWaveform(recording.audio, applied)
        : recording.waveform,
    [recording, applied, duration],
  );

  useEffect(
    () => () => {
      if (source.current) URL.revokeObjectURL(source.current.url);
      source.current = null;
    },
    [],
  );

  function getClip(selection: AudioRange, limit: number) {
    const cached = source.current;
    const blob =
      cached?.range === selection
        ? cached.blob
        : recording.audio && (selection.start > 0 || selection.end < duration)
          ? trimVoiceAudio(recording.audio, selection, limit)
          : recording.blob;
    if (blob.size > limit) throw new Error("Запись превышает лимит беседы.");
    return blob;
  }

  function loadClip(audio: HTMLAudioElement, selection: AudioRange) {
    if (source.current?.range === selection) return;
    const blob = getClip(
      selection,
      selection.start > 0 || selection.end < duration ? maxBytes : Infinity,
    );
    if (source.current) URL.revokeObjectURL(source.current.url);
    const url = URL.createObjectURL(blob);
    source.current = { range: selection, blob, url };
    audio.src = url;
  }

  function resetPlayback() {
    const audio = audioRef.current;
    audio?.pause();
    if (audio?.hasAttribute("src")) audio.currentTime = 0;
    setPlaying(false);
    setTime(0);
    setError("");
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setError("");
    try {
      loadClip(audio, range);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Не удалось подготовить фрагмент.",
      );
      return;
    }
    try {
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
    } catch (failure) {
      if (
        audio.paused &&
        !(failure instanceof DOMException && failure.name === "AbortError")
      ) {
        setError("Не удалось воспроизвести запись.");
      }
    }
  }

  function seek(fraction: number) {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      loadClip(audio, range);
      audio.currentTime = fraction * length;
      setTime(fraction * length);
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Не удалось перемотать запись.",
      );
    }
  }

  function closeTrim(apply: boolean) {
    resetPlayback();
    if (apply && draft) setApplied(draft);
    setDraft(null);
    requestAnimationFrame(() => trimButton.current?.querySelector("button")?.focus());
  }

  async function send() {
    if (sending || draft) return;
    resetPlayback();
    setSending(true);
    try {
      const blob = getClip(applied, maxBytes);
      await onSubmit(
        new File([blob], `voice-${Date.now()}.${extension(blob.type)}`, {
          type: blob.type || "audio/webm",
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Не удалось отправить голосовое.",
      );
      setSending(false);
    }
  }

  return (
    <div
      className={styles.preview}
      onKeyDown={(event) => {
        if (event.key === "Escape" && draft) {
          event.preventDefault();
          closeTrim(false);
        }
      }}
    >
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) =>
          setTime(Math.min(length, event.currentTarget.currentTime))
        }
      />
      <IconButton
        label={draft ? "Отменить обрезку" : "Удалить запись"}
        icon={draft ? "close" : "trash"}
        size="sm"
        disabled={sending}
        onClick={draft ? () => closeTrim(false) : onDelete}
      />
      <IconButton
        data-voice-play
        label={playing ? "Пауза" : draft ? "Прослушать фрагмент" : "Прослушать"}
        icon={playing ? "pause" : "play"}
        size="sm"
        className={styles.play}
        disabled={sending}
        onClick={() => void toggle()}
      />
      <div className={styles.waveform}>
        <AudioWaveform
          samples={draft ? recording.waveform : waveform}
          progress={draft ? (draft.start + time) / duration : time / length}
          selection={draft ? [draft.start / duration, draft.end / duration] : undefined}
          interactive={!draft && !sending}
          onSeek={seek}
          barCount={96}
        />
        {draft ? (
          <div className={styles.trimHandles}>
            {(["start", "end"] as const).map((edge) => (
              <input
                key={edge}
                ref={edge === "start" ? trimStart : undefined}
                type="range"
                min={0}
                max={duration}
                step="any"
                value={draft[edge]}
                aria-label={edge === "start" ? "Начало фрагмента" : "Конец фрагмента"}
                aria-valuetext={`${draft[edge].toFixed(1)} с`}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  resetPlayback();
                  setDraft({
                    ...draft,
                    [edge]:
                      edge === "start"
                        ? Math.min(value, draft.end - 0.5)
                        : Math.max(value, draft.start + 0.5),
                  });
                }}
                onKeyDown={(event) => {
                  const delta = {
                    ArrowLeft: -0.1,
                    ArrowDown: -0.1,
                    ArrowRight: 0.1,
                    ArrowUp: 0.1,
                  }[event.key];
                  if (delta === undefined) return;
                  event.preventDefault();
                  resetPlayback();
                  const min = edge === "start" ? 0 : draft.start + 0.5;
                  const max = edge === "start" ? draft.end - 0.5 : duration;
                  setDraft({
                    ...draft,
                    [edge]: Math.min(
                      max,
                      Math.max(min, draft[edge] + delta * (event.shiftKey ? 10 : 1)),
                    ),
                  });
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      <span className={styles.time}>
        {time > 0 ? `${formatVoiceTime(time)} / ` : ""}
        {draft ? `${length.toFixed(1)} с` : formatVoiceTime(Math.round(length))}
      </span>
      {canTrim && !draft ? (
        <div ref={trimButton}>
          <IconButton
            label="Обрезать запись"
            icon="scissors"
            size="sm"
            disabled={sending}
            onClick={() => {
              resetPlayback();
              setDraft(applied);
              requestAnimationFrame(() => trimStart.current?.focus());
            }}
          />
        </div>
      ) : null}
      {error ? (
        <span className={styles.previewError} role="alert">
          {error}
        </span>
      ) : null}
      {actionSlot.current
        ? createPortal(
            <IconButton
              label={draft ? "Применить обрезку" : "Отправить голосовое"}
              icon={draft ? "check" : "send"}
              variant="send"
              iconSize={18}
              disabled={sending}
              onClick={() => (draft ? closeTrim(true) : void send())}
            />,
            actionSlot.current,
          )
        : null}
    </div>
  );
}
