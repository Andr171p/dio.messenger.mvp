import {
  createAudioRecorder,
  decodeVoiceAudio,
  getVoiceWaveform,
  resampleWaveform,
  type AudioRecorder,
  type VoiceRecordingResult,
} from "@dio/messenger-core";
import { IconButton } from "@dio/messenger-ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { formatVoiceTime } from "../../widgets/formatVoiceTime.js";
import { VoicePreview } from "./VoicePreview.js";
import composerStyles from "./MessageComposer.module.css";
import styles from "./VoiceRecorder.module.css";

type Phase = "idle" | "requesting" | "held" | "locked" | "processing" | "preview";
type Gesture = {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  element: HTMLButtonElement;
};
type Preview = VoiceRecordingResult & { audio: AudioBuffer | null; waveform: number[] };

const MIN_RECORDING_MS = 500;
const CLICK_MS = 200;
const GESTURE_DISTANCE = 64;

export function VoiceRecorder({
  children,
  idleSend,
  onStart,
  onRecording,
  onSubmit,
  disabled,
  maxBytes,
}: {
  children: ReactNode;
  idleSend: ReactNode;
  onStart: () => void;
  onRecording: (active: boolean) => void;
  onSubmit: (file: File) => Promise<void>;
  disabled: boolean;
  maxBytes: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const currentPhase = useRef<Phase>("idle");
  const recorder = useRef<AudioRecorder | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const action = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const submitLock = useRef(false);
  const stopClick = useRef(false);
  const recordingLevels = useRef<number[]>([]);
  const isRecording = phase === "held" || phase === "locked";
  const microphoneActive = isRecording && !paused;

  useEffect(() => {
    if (!microphoneActive) return;
    onRecording(true);
    const heartbeat = setInterval(() => onRecording(true), 2_500);
    return () => {
      clearInterval(heartbeat);
      onRecording(false);
    };
  }, [microphoneActive, onRecording]);

  function transition(next: Phase) {
    currentPhase.current = next;
    setPhase(next);
  }

  const releaseGesture = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    row.current?.style.removeProperty("--voice-cancel-progress");
    if (active?.element.hasPointerCapture(active.id))
      active.element.releasePointerCapture(active.id);
  }, []);

  const reset = useCallback(
    (message = "") => {
      releaseGesture();
      const active = recorder.current;
      recorder.current = null;
      active?.cancel();
      clearInterval(timer.current);
      action.current?.style.removeProperty("--voice-level");
      setPaused(false);
      setPreview(null);
      transition("idle");
      setError(message);
    },
    [releaseGesture],
  );

  useEffect(
    () => () => {
      const active = recorder.current;
      recorder.current = null;
      active?.cancel();
      clearInterval(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (disabled && phase !== "idle" && !submitLock.current) reset();
  }, [disabled, phase, reset]);

  async function start() {
    if (disabled || currentPhase.current !== "idle") return;
    onStart();
    setError("");
    setElapsed(0);
    transition("requesting");
    const levels: number[] = [];
    let smoothed = 0;
    const active = createAudioRecorder({
      onLevel(rms) {
        const value = Math.sqrt(Math.max(0, Math.min(1, (rms - 0.008) / 0.1)));
        smoothed += (value - smoothed) * (value > smoothed ? 0.62 : 0.25);
        action.current?.style.setProperty("--voice-level", String(smoothed));
        levels.push(Math.round(value * 100));
      },
      onError() {
        if (recorder.current === active && currentPhase.current !== "requesting") {
          reset("Запись прервалась. Попробуйте ещё раз.");
        }
      },
    });
    recorder.current = active;
    recordingLevels.current = levels;
    try {
      await active.start();
      if (recorder.current !== active) return;
      transition(gesture.current ? "held" : "locked");
      timer.current = setInterval(() => setElapsed(active.elapsedMs()), 150);
    } catch (failure) {
      if (recorder.current !== active) return;
      const denied =
        failure instanceof DOMException && failure.name === "NotAllowedError";
      reset(
        denied ? "Разрешите доступ к микрофону для записи." : "Микрофон недоступен.",
      );
    }
  }

  async function finish(focusPreview = false) {
    const active = recorder.current;
    if (
      !active ||
      (currentPhase.current !== "held" && currentPhase.current !== "locked")
    )
      return;
    releaseGesture();
    clearInterval(timer.current);
    transition("processing");
    try {
      const result = await active.stop();
      if (recorder.current !== active) return;
      if (!result.blob.size || result.durationMs < MIN_RECORDING_MS) {
        reset("Запись слишком короткая. Удерживайте микрофон для записи.");
        return;
      }
      const audio = await decodeVoiceAudio(result.blob).catch(() => null);
      if (recorder.current !== active) return;
      const waveform = audio
        ? getVoiceWaveform(audio, { start: 0, end: audio.duration })
        : resampleWaveform(recordingLevels.current, 96);
      recorder.current = null;
      setPreview({
        ...result,
        durationMs: audio ? audio.duration * 1000 : result.durationMs,
        audio,
        waveform,
      });
      transition("preview");
      if (focusPreview) {
        requestAnimationFrame(() =>
          row.current?.querySelector<HTMLButtonElement>("[data-voice-play]")?.focus(),
        );
      }
    } catch {
      if (recorder.current === active) reset("Не удалось подготовить запись.");
    }
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    stopClick.current = currentPhase.current === "locked";
    if (currentPhase.current !== "idle") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
      element: event.currentTarget,
    };
    void start();
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (active?.id !== event.pointerId) return;
    const left = active.x - event.clientX;
    const up = active.y - event.clientY;
    row.current?.style.setProperty(
      "--voice-cancel-progress",
      String(Math.max(0, left) / GESTURE_DISTANCE),
    );
    if (left >= GESTURE_DISTANCE && left >= up) reset();
    else if (up >= GESTURE_DISTANCE && up > left) {
      releaseGesture();
      if (currentPhase.current === "held") transition("locked");
    }
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (active?.id !== event.pointerId) return;
    releaseGesture();
    if (currentPhase.current === "requesting") {
      reset("Удерживайте микрофон, пока запись не начнётся.");
    } else if (
      event.pointerType === "mouse" &&
      performance.now() - active.startedAt < CLICK_MS
    ) {
      transition("locked");
    } else {
      void finish();
    }
  }

  function interrupt(event: PointerEvent<HTMLButtonElement>) {
    stopClick.current = false;
    if (gesture.current?.id === event.pointerId) reset();
  }

  const recordingUi = phase === "requesting" || isRecording;
  const caption =
    phase === "requesting" ? "Доступ к микрофону…" : formatVoiceTime(elapsed / 1000);
  const actionLabel =
    phase === "locked"
      ? "Завершить запись"
      : phase === "idle"
        ? "Записать голосовое сообщение"
        : "Идёт запись";

  return (
    <>
      <div
        className={composerStyles.composerShell}
        onKeyDown={(event) => {
          if (
            event.key !== "Escape" ||
            currentPhase.current === "idle" ||
            submitLock.current
          )
            return;
          if (event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          reset();
          requestAnimationFrame(() => action.current?.querySelector("button")?.focus());
        }}
      >
        <div className={styles.idleRow} hidden={phase !== "idle"}>
          {children}
        </div>
        <div
          ref={row}
          className={composerStyles.composerRow + " " + styles.voiceRow}
          hidden={phase === "idle"}
        >
          {recordingUi ? (
            <>
              <span className={styles.dot} data-paused={paused} aria-hidden="true" />
              <span
                className={styles.time}
                role={phase === "requesting" ? "status" : undefined}
              >
                {caption}
              </span>
              <div className={styles.recordActions}>
                {phase === "locked" ? (
                  <IconButton
                    label={paused ? "Продолжить запись" : "Приостановить запись"}
                    icon={paused ? "play" : "pause"}
                    size="sm"
                    onClick={() => {
                      if (paused) recorder.current?.resume();
                      else recorder.current?.pause();
                      action.current?.style.removeProperty("--voice-level");
                      setPaused(!paused);
                    }}
                  />
                ) : null}
                {phase === "held" ? (
                  <span className={styles.lockHint}>↑ Зафиксировать</span>
                ) : null}
                <button className={styles.cancel} type="button" onClick={() => reset()}>
                  {phase === "held" ? "← Отмена" : "Отмена"}
                </button>
              </div>
            </>
          ) : null}
          {phase === "processing" ? (
            <span role="status">Подготовка записи…</span>
          ) : null}
          {preview ? (
            <VoicePreview
              recording={preview}
              maxBytes={maxBytes}
              onDelete={() => {
                reset();
                requestAnimationFrame(() =>
                  action.current?.querySelector("button")?.focus(),
                );
              }}
              onSubmit={async (file) => {
                submitLock.current = true;
                try {
                  await onSubmit(file);
                  reset();
                } finally {
                  submitLock.current = false;
                }
              }}
              actionSlot={action}
            />
          ) : null}
        </div>
        <div
          ref={action}
          className={composerStyles.sendSlot + " " + styles.action}
          data-pulsing={microphoneActive}
        >
          {phase !== "preview" && phase !== "processing" ? (
            <IconButton
              className={styles.recordButton}
              label={actionLabel}
              icon={phase === "locked" ? "stop" : phase === "held" ? "send" : "mic"}
              filled={phase === "held"}
              variant={recordingUi || !idleSend ? "send" : "quiet"}
              disabled={phase === "idle" && disabled}
              aria-disabled={phase === "held" || phase === "requesting" || undefined}
              title={
                phase === "idle"
                  ? "Удерживайте для записи. Enter или пробел — запись без удержания."
                  : actionLabel
              }
              onKeyDown={(event) => {
                if (event.repeat && (event.key === "Enter" || event.key === " "))
                  event.preventDefault();
              }}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={interrupt}
              onLostPointerCapture={(event) => {
                if (gesture.current?.id === event.pointerId) reset();
              }}
              onClick={(event) => {
                const shouldStop = event.detail === 0 || stopClick.current;
                stopClick.current = false;
                if (event.detail === 0 && currentPhase.current === "idle") void start();
                else if (currentPhase.current === "locked" && shouldStop)
                  void finish(event.detail === 0);
              }}
            />
          ) : null}
        </div>
        {phase === "idle" ? idleSend : null}
      </div>
      {error ? (
        <p className={styles.error} role="status">
          {error}
        </p>
      ) : null}
    </>
  );
}
