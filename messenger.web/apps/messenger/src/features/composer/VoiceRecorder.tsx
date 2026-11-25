import {
  createAudioRecorder,
  type AudioRecorder,
  type VoiceRecordingResult,
} from "@dio/messenger-core";
import { IconButton } from "@dio/messenger-ui";
import { useEffect, useRef, useState } from "react";
import { AudioWaveform } from "../../widgets/AudioWaveform.js";
import styles from "./VoiceRecorder.module.css";

type Phase = "idle" | "recording" | "preview";

function extensionForMime(mimeType: string): string {
  if (mimeType.startsWith("audio/mp4")) return ".m4a";
  if (mimeType.startsWith("audio/ogg")) return ".ogg";
  return ".webm";
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function VoiceRecorder({
  onSubmit,
  onClose,
  disabled,
}: {
  onSubmit: (file: File) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingResult, setRecordingResult] = useState<VoiceRecordingResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelsRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function startRecording(): Promise<void> {
    setLevels([]);
    levelsRef.current = [];
    setElapsedMs(0);
    setRecordingResult(null);
    const recorder = createAudioRecorder({
      onLevel: (rms) => {
        levelsRef.current = [...levelsRef.current, Math.round(rms * 100)];
        setLevels(levelsRef.current);
      },
      onError: () => setPhase("idle"),
    });
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setPhase("recording");
      timerRef.current = setInterval(() => setElapsedMs(recorder.elapsedMs()), 200);
    } catch {
      setPhase("idle");
    }
  }

  async function stopRecording(): Promise<void> {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const result = await recorder.stop();
      setRecordingResult(result);
      setPreviewUrl(URL.createObjectURL(result.blob));
      setPhase("preview");
    } catch {
      setPhase("idle");
    }
  }

  function cancelRecording(): void {
    recorderRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("idle");
    setLevels([]);
  }

  function submit(): void {
    if (!recordingResult) return;
    const file = new File(
      [recordingResult.blob],
      `voice-${Date.now()}${extensionForMime(recordingResult.mimeType)}`,
      { type: recordingResult.mimeType || "audio/webm" },
    );
    onSubmit(file);
  }

  async function togglePreview(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  if (phase === "idle") {
    return (
      <div className={styles.panel}>
        <IconButton
          label="Записать голосовое сообщение"
          icon="mic"
          size="sm"
          iconSize={20}
          disabled={disabled}
          onClick={() => void startRecording()}
        />
        <span className={styles.hint}>Запись голосового</span>
        <IconButton label="Закрыть" icon="close" size="sm" iconSize={18} onClick={onClose} />
      </div>
    );
  }

  if (phase === "recording") {
    return (
      <div className={styles.panel}>
        <span className={styles.recordingDot} />
        <AudioWaveform samples={levels} barCount={48} />
        <span className={styles.time}>{formatTime(elapsedMs)}</span>
        <IconButton
          label="Отменить"
          icon="close"
          size="sm"
          iconSize={18}
          onClick={cancelRecording}
        />
        <IconButton
          label="Завершить запись"
          icon="stop"
          variant="send"
          size="sm"
          iconSize={16}
          onClick={() => void stopRecording()}
        />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <audio
        ref={audioRef}
        src={previewUrl ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <IconButton
        label={playing ? "Пауза" : "Прослушать"}
        icon={playing ? "pause" : "play"}
        size="sm"
        iconSize={18}
        onClick={() => void togglePreview()}
      />
      <AudioWaveform samples={levels} barCount={48} />
      <span className={styles.time}>{formatTime(recordingResult?.durationMs ?? 0)}</span>
      <IconButton label="Отменить" icon="close" size="sm" iconSize={18} onClick={cancelRecording} />
      <IconButton
        label="Отправить голосовое"
        icon="send"
        variant="send"
        size="sm"
        iconSize={16}
        onClick={submit}
      />
    </div>
  );
}
