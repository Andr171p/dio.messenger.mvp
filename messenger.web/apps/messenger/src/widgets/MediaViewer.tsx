import type { components } from "@dio/messenger-core";
import { IconButton } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useDirectoryProfiles } from "../features/read/useConversationMembers.js";
import { useMediaSource } from "./useMediaSource.js";
import styles from "./MediaViewer.module.css";

export interface MediaSelection {
  conversationId: string;
  assetId: string;
  messageId?: string;
  filename: string;
  contentType: string;
  authorName: string;
  sentAt: number;
}

type GalleryKey = components["schemas"]["MediaGalleryKeyDTO"];
type GalleryPosition = components["schemas"]["MediaGalleryPositionDTO"];

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function MediaViewer({
  initial,
  onClose,
}: {
  initial: MediaSelection;
  onClose: () => void;
}) {
  const { http } = useRuntime();
  const { session } = useAuth();
  const profiles = useDirectoryProfiles(true);
  const [selected, setSelected] =
    useState<Pick<MediaSelection, "assetId" | "messageId">>(initial);
  const { metadata, source, sourceError } = useMediaSource(selected.assetId, "all");
  const [failedSource, setFailedSource] = useState<string>();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const downloadRequest = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const isInitial =
    selected.assetId === initial.assetId && selected.messageId === initial.messageId;
  const filename =
    metadata.data?.filename ?? (isInitial ? initial.filename : "Вложение");
  const canDownload = metadata.data?.status === "ready";
  const contentType = metadata.data?.contentType ?? initial.contentType;
  const kind = contentType.startsWith("image/")
    ? "Фото"
    : contentType.startsWith("video/")
      ? "Видео"
      : "Аудио";
  const gallery = useQuery({
    queryKey: ["media-gallery", selected.assetId, selected.messageId],
    enabled: !!http && !!selected.messageId,
    staleTime: 10_000,
    retry: false,
    queryFn: () =>
      http!.get<GalleryPosition>(
        "/v1/media/" +
          selected.assetId +
          "/gallery?" +
          new URLSearchParams({ messageId: selected.messageId! }),
      ),
  });

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => downloadRequest.current?.abort();
  }, []);

  function navigate(item?: GalleryKey | null) {
    if (!item) return;
    downloadRequest.current?.abort();
    downloadRequest.current = null;
    setSelected(item);
    setFailedSource(undefined);
    setDownloading(false);
    setDownloadError(false);
  }

  async function download() {
    if (!http || downloading || !canDownload) return;
    const controller = new AbortController();
    downloadRequest.current = controller;
    setDownloading(true);
    setDownloadError(false);
    try {
      const asset = await http.request<Blob>(
        "/v1/media/" + selected.assetId + "/content",
        {
          responseType: "blob",
          timeoutMs: 90_000,
          signal: controller.signal,
        },
      );
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(asset);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      if (!controller.signal.aborted) setDownloadError(true);
    } finally {
      if (downloadRequest.current === controller) {
        downloadRequest.current = null;
        setDownloading(false);
      }
    }
  }

  const entry = gallery.data;
  const author = entry?.senderId
    ? entry.senderId === session?.userId
      ? "Вы"
      : (profiles.data?.[entry.senderId] ??
        (isInitial ? initial.authorName : "Участник"))
    : isInitial
      ? initial.authorName
      : undefined;
  const sentAt = entry?.sentAt ?? (isInitial ? initial.sentAt : undefined);
  const date = sentAt === undefined ? null : new Date(sentAt);
  const hasDate = !!date && Number.isFinite(date.getTime());
  const broken =
    metadata.isError || sourceError || (!!source && failedSource === source);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={"Предпросмотр " + filename}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLMediaElement || !entry) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          navigate(event.key === "ArrowLeft" ? entry.previous : entry.next);
        }
      }}
    >
      <div className={styles.top}>
        <span className={styles.filename}>{filename}</span>
        <IconButton
          className={styles.control}
          icon="close"
          label="Закрыть предпросмотр"
          onClick={() => dialog.current?.close()}
        />
      </div>
      <div
        className={styles.media}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {broken ? (
          <p role="status">Предпросмотр недоступен</p>
        ) : !source ? (
          <p role="status">Загрузка…</p>
        ) : kind === "Фото" ? (
          <img
            src={source}
            alt={filename}
            data-png={contentType === "image/png" || undefined}
            onError={() => setFailedSource(source)}
          />
        ) : kind === "Видео" ? (
          <video
            src={source}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailedSource(source)}
          />
        ) : (
          <audio
            src={source}
            controls
            preload="metadata"
            onError={() => setFailedSource(source)}
          />
        )}
        {entry?.previous ? (
          <IconButton
            className={styles.previous}
            icon="previous"
            label="Предыдущее вложение"
            onClick={() => navigate(entry.previous)}
          />
        ) : null}
        {entry?.next ? (
          <IconButton
            className={styles.next}
            icon="next"
            label="Следующее вложение"
            onClick={() => navigate(entry.next)}
          />
        ) : null}
      </div>
      <div className={styles.bottom}>
        <div className={styles.caption} aria-live="polite">
          <strong>
            {entry?.position
              ? kind + " " + entry.position + " из " + entry.total
              : kind}
          </strong>
          {author || hasDate ? (
            <span className={styles.details}>
              {author}
              {author && hasDate ? " · " : ""}
              {hasDate ? (
                <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>
              ) : null}
            </span>
          ) : null}
        </div>
        {downloadError ? (
          <span role="alert" className={styles.details}>
            Не удалось скачать файл
          </span>
        ) : null}
        <IconButton
          className={styles.control}
          icon="download"
          label="Скачать файл"
          disabled={!canDownload || downloading}
          onClick={() => void download()}
        />
      </div>
    </dialog>
  );
}
