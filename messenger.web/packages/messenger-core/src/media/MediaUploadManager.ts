import { HttpError, type HttpClient } from "../transport/httpClient.js";
import type { MediaPresentation } from "../content/blocks.js";

export type MediaUploadStatus =
  "pending" | "uploading" | "completing" | "scanning" | "ready" | "failed";

export interface MediaUploadJob {
  id: string;
  file: File;
  conversationId: string;
  status: MediaUploadStatus;
  progress: number;
  uploadId?: string;
  assetId?: string;
  error?: string;
  retryable?: boolean;
  uploaded?: boolean;
  /** Желаемое представление media block (голосовое сообщение и т.п.). */
  presentation?: MediaPresentation;
  /** Ссылка на запись в IndexedDB для offline-возобновления голосовой записи. */
  voiceUploadId?: string;
  sendAsMessage?: boolean;
}

export interface MediaUploadEnqueueOptions {
  presentation?: MediaPresentation;
  voiceUploadId?: string;
  sendAsMessage?: boolean;
}

interface CreateUploadSessionResponse {
  uploadId: string;
  uploadUrl: string;
  asset: { id: string; status: string };
  expiresIn: number;
}

interface CompleteUploadResponse {
  id: string;
  status: string;
}

const inlineTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
]);

export function getInlineMediaPresentation(contentType: string): "image" | "video" | undefined {
  const type = contentType.split(";", 1)[0] ?? "";
  if (!inlineTypes.has(type)) return undefined;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return undefined;
}

const uploadTimeoutMs = 180_000;
const readyPollIntervalMs = 200;
const readyPollTimeoutMs = 60_000;

export class MediaUploadManager {
  private jobs = new Map<string, MediaUploadJob>();
  private listeners = new Set<() => void>();

  constructor(
    private readonly http: HttpClient,
    private readonly saveReady?: (job: MediaUploadJob) => Promise<void>,
    private readonly signal?: AbortSignal,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getJobs(): MediaUploadJob[] {
    return [...this.jobs.values()];
  }

  dismiss(id: string): void {
    this.jobs.delete(id);
  }

  retry(id: string): void {
    const job = this.jobs.get(id);
    if (job?.status !== "failed" || !job.retryable) return;
    job.error = undefined;
    void this.runUpload(id);
  }

  async enqueue(
    file: File,
    conversationId: string,
    options: MediaUploadEnqueueOptions = {},
  ): Promise<string> {
    if (options.voiceUploadId) {
      const existing = [...this.jobs.values()].find(
        (job) => job.voiceUploadId === options.voiceUploadId,
      );
      if (existing) {
        if (existing.status === "failed" && existing.retryable) this.retry(existing.id);
        return existing.id;
      }
    }
    const id = crypto.randomUUID();
    const job: MediaUploadJob = {
      id,
      file,
      conversationId,
      status: "pending",
      progress: 0,
      ...(options.presentation ? { presentation: options.presentation } : {}),
      ...(options.voiceUploadId ? { voiceUploadId: options.voiceUploadId } : {}),
      ...(options.sendAsMessage ? { sendAsMessage: true } : {}),
    };
    this.jobs.set(id, job);
    this.notify();
    void this.runUpload(id);
    return id;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async runUpload(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = job.uploaded ? "completing" : "uploading";
    this.notify();

    try {
      if (!job.uploaded) {
        const declaredType = job.file.type.split(";", 1)[0] ?? "";
        const contentType =
          inlineTypes.has(declaredType) ||
          (job.presentation === "voice" && declaredType === "audio/mp4")
            ? declaredType
            : "application/octet-stream";
        const session = await this.http.post<CreateUploadSessionResponse>(
          `/v1/media/uploads`,
          {
            filename: job.file.name,
            contentType,
            size: job.file.size,
            target: {
              type: "message",
              conversationId: job.conversationId,
            },
          },
        );

        job.uploadId = session.uploadId;
        job.assetId = session.asset.id;
        this.notify();

        const upload = {
          method: "PUT",
          body: job.file,
          signal: this.signal,
          headers: { "Content-Type": contentType },
        };
        let uploaded = false;
        try {
          const timeout = AbortSignal.timeout(uploadTimeoutMs);
          const signal = this.signal
            ? AbortSignal.any([this.signal, timeout])
            : timeout;
          uploaded = (await fetch(session.uploadUrl, { ...upload, signal })).ok;
        } catch {
          this.signal?.throwIfAborted();
        }
        if (!uploaded) {
          await this.http.request<void>(
            `/v1/media/uploads/${session.uploadId}/content`,
            { ...upload, timeoutMs: uploadTimeoutMs },
          );
        }
        job.uploaded = true;
      }

      job.status = "completing";
      job.progress = 90;
      this.notify();

      let completed = await this.http.post<CompleteUploadResponse>(
        `/v1/media/uploads/${job.uploadId}/complete`,
      );
      if (["uploaded", "scanning"].includes(completed.status)) {
        job.status = "scanning";
        this.notify();
      }
      const readyPollStarted = Date.now();
      while (
        ["uploaded", "scanning"].includes(completed.status) &&
        Date.now() - readyPollStarted < readyPollTimeoutMs
      ) {
        await new Promise((resolve) => setTimeout(resolve, readyPollIntervalMs));
        this.signal?.throwIfAborted();
        completed = await this.http.get<CompleteUploadResponse>(
          `/v1/media/${completed.id}`,
        );
      }
      if (completed.status === "rejected" || completed.status === "deleted") {
        job.status = "failed";
        job.retryable = false;
        job.error =
          completed.status === "rejected"
            ? "Файл отклонён при проверке"
            : "Файл недоступен";
        this.notify();
        return;
      }
      if (completed.status !== "ready")
        throw new Error("Не удалось дождаться проверки файла");
      this.signal?.throwIfAborted();
      await this.saveReady?.(job);

      job.progress = 100;
      job.assetId = completed.id;
      job.status = "ready";
    } catch (error) {
      if (this.signal?.aborted) return;
      job.status = "failed";
      const status = error instanceof HttpError ? error.status : null;
      const details = error instanceof HttpError ? error.body : undefined;
      const unsupportedRecording =
        job.presentation === "voice" &&
        status === 422 &&
        details !== null &&
        typeof details === "object" &&
        "errorCode" in details &&
        details.errorCode === "media_policy_violation" &&
        "message" in details &&
        typeof details.message === "string" &&
        details.message.startsWith("Content type ");
      job.retryable =
        unsupportedRecording || !status || status === 429 || status >= 500;
      job.error = unsupportedRecording
        ? "Сервер пока не поддерживает формат этой записи"
        : status === 403 || status === 404
          ? "Файл или беседа недоступны"
          : status === 413
            ? "Размер файла превышает лимит"
            : job.uploaded
              ? "Не удалось завершить проверку файла"
              : "Не удалось загрузить файл";
    }

    this.notify();
  }
}
