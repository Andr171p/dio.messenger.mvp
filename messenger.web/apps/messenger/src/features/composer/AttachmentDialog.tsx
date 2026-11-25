import {
  getInlineMediaPresentation,
  type Draft,
  type MediaUploadJob,
  type MediaUploadManager,
} from "@dio/messenger-core";
import { Button, Icon, IconButton } from "@dio/messenger-ui";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./AttachmentDialog.module.css";

type Attachment = NonNullable<Draft["attachments"]>[number];

export function AttachmentDialog({
  threadId,
  conversationId,
  media,
  files,
  saved,
  caption,
  selectionError,
  onCaptionChange,
  onFileSelection,
  onRemoveFile,
  onRemoveSaved,
  onUploaded,
  onDiscardUploads,
  onClose,
  onSend,
}: {
  conversationId: string;
  threadId?: string;
  media: MediaUploadManager;
  files: File[];
  saved: Attachment[];
  caption: string;
  selectionError: string | null;
  onCaptionChange: (caption: string) => void;
  onFileSelection: (input: HTMLInputElement) => void;
  onRemoveFile: (file: File) => void;
  onRemoveSaved: (attachment: Attachment) => void;
  onUploaded: (attachment: Attachment) => void;
  onDiscardUploads: (assetIds: string[]) => void;
  onClose: () => void;
  onSend: (attachments: Attachment[]) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const captionInput = useRef<HTMLTextAreaElement>(null);
  const uploads = useRef(new Map<File, string>());
  const [source, setSource] = useState<{ file: File; url: string }>();
  const [asDocument, setAsDocument] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canChangeMode, setCanChangeMode] = useState(true);
  const [error, setError] = useState<{ message: string; blocked?: boolean }>();
  const sendLock = useRef(false);
  const abort = useRef<AbortController>(null);
  const titleId = useId();
  const captionId = useId();
  const visualFiles = files.filter((file) => getInlineMediaPresentation(file.type));
  const onlyFile = files.length === 1 && !saved.length ? files[0] : undefined;
  const preview =
    !asDocument && onlyFile && getInlineMediaPresentation(onlyFile.type)
      ? onlyFile
      : undefined;
  const title =
    onlyFile && visualFiles.length
      ? getInlineMediaPresentation(onlyFile.type) === "video"
        ? "Отправить видео"
        : "Отправить изображение"
      : "Отправить вложения";

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    dialog.current?.showModal();
    captionInput.current?.focus();
    captionInput.current?.setSelectionRange(
      captionInput.current.value.length,
      captionInput.current.value.length,
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!preview) return;
    const url = URL.createObjectURL(preview);
    setSource({ file: preview, url });
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  function remove(file: File) {
    const jobId = uploads.current.get(file);
    if (jobId) {
      discardUploads([jobId]);
      uploads.current.delete(file);
      setCanChangeMode(uploads.current.size === 0);
    }
    setError(undefined);
    onRemoveFile(file);
  }

  function cancel() {
    if (sendLock.current) return;
    discardUploads([...uploads.current.values()]);
    onClose();
  }

  function discardUploads(ids: string[]) {
    const assetIds = media
      .getJobs()
      .flatMap((job) =>
        ids.includes(job.id) && job.status === "ready" && job.assetId
          ? [job.assetId]
          : [],
      );
    for (const id of ids) media.dismiss(id);
    if (assetIds.length) onDiscardUploads(assetIds);
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signal = abort.current?.signal;
    if (
      sendLock.current ||
      error?.blocked ||
      !signal ||
      (!files.length && !saved.length)
    )
      return;
    sendLock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const results = await Promise.all(
        files.map(async (file): Promise<MediaUploadJob> => {
          let id = uploads.current.get(file);
          if (id) {
            media.retry(id);
          } else {
            id = await media.enqueue(file, conversationId, {
              threadId,
              presentation: asDocument ? "file" : getInlineMediaPresentation(file.type),
            });
            uploads.current.set(file, id);
          }
          const job = await waitForUpload(media, id, signal);
          signal.throwIfAborted();
          const attachment = toAttachment(job);
          if (attachment) onUploaded(attachment);
          return job;
        }),
      );
      signal.throwIfAborted();
      const failed =
        results.find((job) => job.status === "failed" && !job.retryable) ??
        results.find((job) => job.status === "failed");
      if (failed) {
        const nextStep = failed.retryable
          ? "Повторите отправку."
          : "Удалите файл из вложений.";
        setError({
          message: `${failed.file.name} · ${failed.error ?? "Ошибка загрузки"}. ${nextStep}`,
          blocked: !failed.retryable,
        });
        return;
      }
      const uploaded = results.map(toAttachment).filter((item) => item !== undefined);
      if (await onSend([...saved, ...uploaded])) {
        for (const id of uploads.current.values()) media.dismiss(id);
        onClose();
      } else {
        setError({
          message: "Не удалось сохранить сообщение для отправки. Повторите отправку.",
        });
      }
    } catch {
      if (!signal.aborted) {
        setError({ message: "Не удалось загрузить вложения. Повторите отправку." });
      }
    } finally {
      sendLock.current = false;
      if (!signal.aborted) {
        setCanChangeMode(uploads.current.size === 0);
        setBusy(false);
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <form className={styles.form} onSubmit={(event) => void send(event)}>
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          onChange={(event) => onFileSelection(event.currentTarget)}
        />
        <header className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <IconButton
            icon="close"
            label="Закрыть"
            size="sm"
            onClick={cancel}
            disabled={busy}
          />
        </header>
        {preview ? (
          <div className={styles.preview}>
            {source?.file === preview ? (
              getInlineMediaPresentation(preview.type) === "video" ? (
                <video controls playsInline preload="metadata" src={source.url} />
              ) : (
                <img
                  src={source.url}
                  alt={preview.name}
                  data-png={preview.type === "image/png" || undefined}
                />
              )
            ) : null}
          </div>
        ) : null}
        {!preview ? (
          <ul className={styles.files}>
            {files.map((file, index) => (
              <li key={index} className={styles.file}>
                <FileThumbnail file={file} />
                <span className={styles.fileName}>
                  <strong>{file.name}</strong>
                  <small>{formatSize(file.size)}</small>
                </span>
                <IconButton
                  icon="close"
                  label={`Убрать ${file.name}`}
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(file)}
                />
              </li>
            ))}
            {saved.map((attachment, index) => (
              <li key={`saved-${index}`} className={styles.file}>
                <span className={styles.fileIcon}>
                  <Icon name="file" size={21} />
                </span>
                <strong className={styles.fileName}>{attachment.label}</strong>
                <IconButton
                  icon="close"
                  label={`Убрать ${attachment.label}`}
                  size="sm"
                  disabled={busy}
                  onClick={() => onRemoveSaved(attachment)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {preview ? (
          <div className={styles.previewName}>
            <span>
              {preview.name} · {formatSize(preview.size)}
            </span>
            <IconButton
              icon="close"
              label={`Убрать ${preview.name}`}
              size="sm"
              disabled={busy}
              onClick={() => remove(preview)}
            />
          </div>
        ) : null}
        {visualFiles.length ? (
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={asDocument}
              onChange={(event) => setAsDocument(event.target.checked)}
              disabled={busy || !canChangeMode}
            />
            Отправить как {visualFiles.length > 1 ? "файлы" : "файл"}
          </label>
        ) : null}
        <div className={styles.caption}>
          <label htmlFor={captionId}>Подпись</label>
          <textarea
            id={captionId}
            ref={captionInput}
            value={caption}
            placeholder="Добавить подпись…"
            readOnly={busy}
            rows={2}
            onChange={(event) => onCaptionChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              )
                return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
          />
        </div>
        {busy ? (
          <p className={styles.note} role="status">
            Загрузка и проверка вложений…
          </p>
        ) : null}
        {error || selectionError ? (
          <p className={styles.note} role="alert">
            {error?.message ?? selectionError}
          </p>
        ) : null}
        <footer className={styles.actions}>
          <Button
            variant="ghost"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            <Icon name="attach" size={16} /> Добавить
          </Button>
          <Button variant="secondary" onClick={cancel} disabled={busy}>
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={busy || error?.blocked || !(files.length || saved.length)}
          >
            {error && !error.blocked ? "Повторить" : "Отправить"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

function toAttachment(job: MediaUploadJob): Attachment | undefined {
  if (job.status !== "ready" || !job.assetId) return undefined;
  return {
    label: job.file.name,
    block: { type: "media", assetId: job.assetId, presentation: job.presentation },
  };
}

function FileThumbnail({ file }: { file: File }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    if (getInlineMediaPresentation(file.type) !== "image") return;
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <span className={styles.fileIcon}>
      {source && getInlineMediaPresentation(file.type) === "image" ? (
        <img src={source} alt="" data-png={file.type === "image/png" || undefined} />
      ) : (
        <Icon name="file" size={21} />
      )}
    </span>
  );
}

function waitForUpload(
  media: MediaUploadManager,
  id: string,
  signal: AbortSignal,
): Promise<MediaUploadJob> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const stop = () => {
      unsubscribe();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(signal.reason);
    };
    const check = () => {
      const job = media.getJobs().find((candidate) => candidate.id === id);
      if (job?.status !== "ready" && job?.status !== "failed") return;
      stop();
      resolve(job);
    };
    const unsubscribe = media.subscribe(check);
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}

function formatSize(bytes: number): string {
  const divisor = bytes >= 1024 * 1024 ? 1024 * 1024 : bytes >= 1024 ? 1024 : 1;
  const unit = divisor === 1 ? "Б" : divisor === 1024 ? "КБ" : "МБ";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
}
