import type { HttpClient } from "../transport/httpClient.js";

export type MediaUploadStatus =
  | "pending"
  | "uploading"
  | "completing"
  | "ready"
  | "failed";

export interface MediaUploadJob {
  id: string;
  file: File;
  conversationId: string;
  status: MediaUploadStatus;
  progress: number;
  uploadId?: string;
  assetId?: string;
  error?: string;
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

export class MediaUploadManager {
  private jobs = new Map<string, MediaUploadJob>();
  private listeners = new Set<() => void>();

  constructor(private readonly http: HttpClient) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getJobs(): MediaUploadJob[] {
    return [...this.jobs.values()];
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

    job.status = "uploading";
    this.notify();

    try {
      const session = await this.http.post<CreateUploadSessionResponse>(
        `/v1/media/uploads`,
        {
          filename: job.file.name,
          contentType: job.file.type || "application/octet-stream",
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

      const put = await fetch(session.uploadUrl, {
        method: "PUT",
        body: job.file,
        headers: {
          "Content-Type": job.file.type || "application/octet-stream",
        },
      });
      if (!put.ok) {
        throw new Error(`Upload PUT failed: ${put.status}`);
      }

      job.status = "completing";
      job.progress = 90;
      this.notify();

      const completed = await this.http.post<CompleteUploadResponse>(
        `/v1/media/uploads/${session.uploadId}/complete`,
      );

      job.progress = 100;
      job.assetId = completed.id;
      job.status = "ready";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    }

    this.notify();
  }
}
