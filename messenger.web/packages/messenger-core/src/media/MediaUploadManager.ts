import { HttpError, type HttpClient } from "../transport/httpClient.js";

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
]);
const uploadTimeoutMs = 180_000;

export class MediaUploadManager {
  private jobs = new Map<string, MediaUploadJob>();
  private listeners = new Set<() => void>();

  constructor(
    private readonly http: HttpClient,
    private readonly saveReady?: (
      conversationId: string,
      assetId: string,
      filename: string,
    ) => Promise<void>,
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

  async enqueue(file: File, conversationId: string): Promise<string> {
    const id = crypto.randomUUID();
    const job: MediaUploadJob = {
      id,
      file,
      conversationId,
      status: "pending",
      progress: 0,
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
        const contentType = inlineTypes.has(declaredType)
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
      for (
        let attempt = 0;
        attempt < 60 && ["uploaded", "scanning"].includes(completed.status);
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
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
      await this.saveReady?.(job.conversationId, completed.id, job.file.name);

      job.progress = 100;
      job.assetId = completed.id;
      job.status = "ready";
    } catch (error) {
      if (this.signal?.aborted) return;
      job.status = "failed";
      const status = error instanceof HttpError ? error.status : null;
      job.retryable = !status || status === 429 || status >= 500;
      job.error =
        status === 403 || status === 404
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
