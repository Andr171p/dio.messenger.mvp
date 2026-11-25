/**
 * Обёртка над MediaRecorder + Web Audio API для записи голосового сообщения.
 *
 * Запись — в браузерном формате (Chrome: audio/webm;opus, Safari: audio/mp4).
 * Live уровень громкости для waveform во время записи приходит через `onLevel`
 * (RMS 0..1), сэмплируется ~20 раз в секунду. Канонические duration/waveform
 * вычисляет backend, здесь — только UI-таймер и превью.
 */

export interface VoiceRecordingResult {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

export interface AudioRecorderOptions {
  onLevel?: (rms: number) => void;
  onError?: (error: Error) => void;
  onStateChange?: (recording: boolean) => void;
}

export interface AudioRecorder {
  readonly recording: boolean;
  start(): Promise<void>;
  stop(): Promise<VoiceRecordingResult>;
  cancel(): void;
  elapsedMs(): number;
}

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function createAudioRecorder(options: AudioRecorderOptions = {}): AudioRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let frameId: number | null = null;
  let startedAt = 0;
  let chunks: BlobPart[] = [];
  let stopResolve: ((result: VoiceRecordingResult) => void) | null = null;
  let stopReject: ((error: Error) => void) | null = null;
  let cancelled = false;

  const state = { recording: false };

  function setRecording(value: boolean): void {
    state.recording = value;
    options.onStateChange?.(value);
  }

  function release(): void {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    analyser?.disconnect();
    analyser = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
    audioContext = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    recorder = null;
  }

  function rmsFromAnalyser(buffer: Uint8Array<ArrayBuffer>): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const normalized = (buffer[i]! - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / buffer.length);
  }

  function loop(analyserNode: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): void {
    let lastEmit = 0;
    const tick = (now: number) => {
      if (!state.recording) return;
      analyserNode.getByteTimeDomainData(buffer);
      const rms = rmsFromAnalyser(buffer);
      if (now - lastEmit >= 50) {
        lastEmit = now;
        options.onLevel?.(rms);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
  }

  async function start(): Promise<void> {
    if (state.recording) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks = [];
      cancelled = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        const error = new Error("Audio recording failed");
        options.onError?.(error);
        stopReject?.(error);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder?.mimeType || mimeType || "audio/webm" });
        release();
        setRecording(false);
        if (cancelled) {
          stopReject?.(new Error("Recording cancelled"));
          return;
        }
        const durationMs = Date.now() - startedAt;
        stopResolve?.({ blob, durationMs, mimeType: blob.type });
        stopResolve = null;
        stopReject = null;
      };

      recorder.start(200);
      startedAt = Date.now();
      setRecording(true);

      try {
        const AudioContextCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          audioContext = new AudioContextCtor();
          const source = audioContext.createMediaStreamSource(stream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          loop(analyser, new Uint8Array(analyser.fftSize));
        }
      } catch {
        // Визуализация best-effort: запись продолжается без уровня громкости.
      }
    } catch (error) {
      const wrapped = error instanceof Error ? error : new Error("Microphone access denied");
      options.onError?.(wrapped);
      throw wrapped;
    }
  }

  async function stop(): Promise<VoiceRecordingResult> {
    if (!state.recording || !recorder) throw new Error("Not recording");
    return new Promise<VoiceRecordingResult>((resolve, reject) => {
      stopResolve = resolve;
      stopReject = reject;
      recorder?.stop();
    });
  }

  function cancel(): void {
    if (!state.recording) return;
    cancelled = true;
    chunks = [];
    recorder?.stop();
  }

  function elapsedMs(): number {
    return state.recording ? Date.now() - startedAt : 0;
  }

  return {
    get recording() {
      return state.recording;
    },
    start,
    stop,
    cancel,
    elapsedMs,
  };
}
