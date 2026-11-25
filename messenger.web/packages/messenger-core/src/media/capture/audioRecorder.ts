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
  pause(): void;
  resume(): void;
  cancel(): void;
  elapsedMs(): number;
}

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function createAudioRecorder(options: AudioRecorderOptions = {}): AudioRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let frameId = 0;
  let startedAt = 0;
  let pausedAt: number | null = null;
  let starting = false;
  let cancelled = false;
  let stopRecording: (() => Promise<VoiceRecordingResult>) | undefined;
  let rejectStop: ((error: Error) => void) | undefined;

  function release() {
    cancelAnimationFrame(frameId);
    stream?.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    audioContext = null;
    stream = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
    }
    recorder = null;
    stopRecording = undefined;
    rejectStop = undefined;
  }

  function monitorLevel(input: MediaStream) {
    if (!audioContext) return;
    const source = audioContext.createMediaStreamSource(input);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    let lastEmit = -Infinity;

    function tick(now: number) {
      if (pausedAt === null && now - lastEmit >= 50) {
        lastEmit = now;
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) sum += sample * sample;
        options.onLevel?.(Math.sqrt(sum / buffer.length));
      }
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);
  }

  async function start() {
    if (starting || recorder) return;
    starting = true;
    cancelled = false;
    try {
      if (options.onLevel) {
        try {
          audioContext = new AudioContext();
          void audioContext.resume().catch(() => undefined);
        } catch {
          // Запись доступна и без Web Audio.
        }
      }
      const input = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (cancelled) {
        input.getTracks().forEach((track) => track.stop());
        throw new Error("Recording cancelled");
      }
      stream = input;
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(input, mimeType ? { mimeType } : undefined);
      recorder = active;
      const chunks: Blob[] = [];

      function fail(error: Error) {
        rejectStop?.(error);
        release();
        options.onStateChange?.(false);
        options.onError?.(error);
      }

      active.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      active.onerror = () => fail(new Error("Audio recording failed"));
      active.onstop = () => fail(new Error("Audio stream ended"));

      active.start(200);
      startedAt = performance.now();
      pausedAt = null;
      stopRecording = () =>
        new Promise<VoiceRecordingResult>((resolve, reject) => {
          const durationMs = (pausedAt ?? performance.now()) - startedAt;
          rejectStop = reject;
          active.onstop = () => {
            const type = active.mimeType || mimeType || "audio/webm";
            const blob = new Blob(chunks, { type });
            release();
            options.onStateChange?.(false);
            resolve({ blob, durationMs, mimeType: type });
          };
          active.stop();
          cancelAnimationFrame(frameId);
        });
      options.onStateChange?.(true);
      try {
        monitorLevel(input);
      } catch {
        // Запись доступна и без Web Audio.
      }
    } catch (error) {
      release();
      const failure =
        error instanceof Error ? error : new Error("Microphone access denied");
      if (!cancelled) options.onError?.(failure);
      throw failure;
    } finally {
      starting = false;
    }
  }

  return {
    get recording() {
      return recorder?.state === "recording";
    },
    start,
    async stop() {
      if (!stopRecording || recorder?.state === "inactive")
        throw new Error("Not recording");
      return stopRecording();
    },
    pause() {
      if (recorder?.state !== "recording") return;
      recorder.pause();
      pausedAt = performance.now();
    },
    resume() {
      if (recorder?.state !== "paused" || pausedAt === null) return;
      recorder.resume();
      startedAt += performance.now() - pausedAt;
      pausedAt = null;
    },
    cancel() {
      cancelled = true;
      const active = recorder;
      rejectStop?.(new Error("Recording cancelled"));
      release();
      if (active?.state === "recording" || active?.state === "paused") active.stop();
      if (active) options.onStateChange?.(false);
    },
    elapsedMs() {
      return recorder ? (pausedAt ?? performance.now()) - startedAt : 0;
    },
  };
}
