import { MediaUploadManager, type HttpClient } from "@dio/messenger-core";

export interface PollOptionDraft {
  id: string;
  label: string;
  link: string;
  file?: File;
}

export function emptyPollOption(): PollOptionDraft {
  return { id: crypto.randomUUID(), label: "", link: "" };
}

export function validPollOption(option: PollOptionDraft): boolean {
  if (!option.label.trim()) return false;
  if (!option.link.trim()) return true;
  try {
    const url = new URL(option.link.trim());
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function uploadPollOptions(
  options: PollOptionDraft[],
  http: HttpClient,
  conversationId: string,
  uploaded: Map<File, string>,
  signal: AbortSignal,
) {
  const media = new MediaUploadManager(http, undefined, signal);
  const details: { link?: string; assetId?: string }[] = [];
  for (const { link, file } of options) {
    signal.throwIfAborted();
    let assetId = file ? uploaded.get(file) : undefined;
    if (file && !assetId) {
      const id = await media.enqueue(file, conversationId);
      signal.throwIfAborted();
      assetId = await new Promise<string>((resolve, reject) => {
        function abort() {
          unsubscribe();
          reject(signal.reason);
        }
        function inspect() {
          const job = media.getJobs().find((item) => item.id === id);
          if (!job || (job.status !== "ready" && job.status !== "failed")) return;
          unsubscribe();
          signal.removeEventListener("abort", abort);
          if (job.status === "ready" && job.assetId) resolve(job.assetId);
          else reject(new Error(job.error ?? "Не удалось загрузить файл."));
        }
        const unsubscribe = media.subscribe(inspect);
        signal.addEventListener("abort", abort, { once: true });
        inspect();
      });
      uploaded.set(file, assetId);
    }
    details.push({ link: link.trim() || undefined, assetId });
  }
  return details;
}
