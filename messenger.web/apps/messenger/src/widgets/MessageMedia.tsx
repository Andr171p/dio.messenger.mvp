import { Icon } from "@dio/messenger-ui";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import {
  HttpError,
  type MediaPresentation,
  type components,
} from "@dio/messenger-core";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { requiresMediaProxy, useMediaSource } from "./useMediaSource.js";
import { VoicePlayer } from "./VoicePlayer.js";
import styles from "./MessageTimeline.module.css";

type PreviewFile = Pick<
  components["schemas"]["MediaAssetDTO"],
  "filename" | "contentType"
>;
type MediaDimensions = { width: number; height: number };

export function MessageMedia({
  assetId,
  presentation,
  onPreview,
}: {
  assetId: string;
  presentation?: MediaPresentation;
  onPreview: (asset: PreviewFile) => void;
}) {
  const { http } = useRuntime();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [failedSource, setFailedSource] = useState<string>();
  const [naturalSize, setNaturalSize] = useState<MediaDimensions>();
  const downloadObjectUrl = useRef<string | undefined>(undefined);
  const downloadRequest = useRef<AbortController | null>(null);
  const [download, setDownload] = useState<
    components["schemas"]["MediaAccessDTO"] | null
  >(null);
  const { metadata, source, sourceError } = useMediaSource(
    assetId,
    presentation === "file" || presentation === "voice" ? "metadata" : "visual",
  );
  const asset = metadata.data;
  const canPreview =
    presentation !== "file" &&
    !!asset &&
    /^(image|audio|video)\//.test(asset.contentType);

  useEffect(
    () => () => {
      downloadRequest.current?.abort();
      if (downloadObjectUrl.current) URL.revokeObjectURL(downloadObjectUrl.current);
    },
    [],
  );

  async function openFile(event: MouseEvent<HTMLButtonElement>) {
    if (!http || opening) return;
    const opener = event.currentTarget;
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;
    const controller = new AbortController();
    downloadRequest.current = controller;
    setOpening(true);
    setOpenError("");
    setDownload(null);
    try {
      const signed = await http.request<components["schemas"]["MediaAccessDTO"]>(
        "/v1/media/" + assetId + "/access",
        {
          method: "POST",
          json: { role: "original" },
          signal: controller.signal,
        },
      );
      const url = new URL(signed.url);
      if (requiresMediaProxy(url)) {
        target?.close();
        const blob = await http.request<Blob>("/v1/media/" + assetId + "/content", {
          responseType: "blob",
          timeoutMs: 90_000,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        if (downloadObjectUrl.current) URL.revokeObjectURL(downloadObjectUrl.current);
        downloadObjectUrl.current = URL.createObjectURL(blob);
        setDownload({ ...signed, url: downloadObjectUrl.current });
        return;
      }
      if (
        url.protocol !== "https:" &&
        !(import.meta.env.DEV && url.protocol === "http:")
      ) {
        throw new Error("Invalid download URL");
      }
      if (target) target.location.replace(url.href);
      else setDownload(signed);
    } catch (error) {
      target?.close();
      if (controller.signal.aborted) return;
      setOpenError(
        error instanceof HttpError && [403, 404, 410].includes(error.status)
          ? "Нет доступа к файлу"
          : "Не удалось открыть файл. Повторите попытку.",
      );
      opener.focus({ preventScroll: true });
    } finally {
      downloadRequest.current = null;
      setOpening(false);
    }
  }

  if (metadata.isError || asset?.status === "rejected" || asset?.status === "deleted") {
    return <div className={styles.mediaPlaceholder}>Вложение недоступно</div>;
  }
  if (!asset || asset.status !== "ready") {
    return (
      <div className={styles.mediaPlaceholder} role="status">
        {asset?.filename ?? "Вложение"} · {asset ? "Проверяется" : "Загрузка…"}
      </div>
    );
  }

  if (presentation === "voice") {
    return <VoicePlayer assetId={assetId} />;
  }

  const video = asset.contentType.startsWith("video/");
  const visual =
    canPreview &&
    (video || asset.contentType.startsWith("image/")) &&
    !sourceError &&
    (!source || failedSource !== source);
  if (visual) {
    const meta = asset.meta;
    // Early uploads reported 1 × 1 as a placeholder for every image.
    const dimensions =
      meta && "width" in meta && (meta.width > 1 || meta.height > 1)
        ? meta
        : naturalSize;
    const ratio = dimensions ? dimensions.width / dimensions.height : 16 / 10;
    const frameStyle = {
      "--visual-width": dimensions
        ? `clamp(120px, min(${dimensions.width}px, calc(min(480px, 55dvh) * ${ratio})), 460px)`
        : "320px",
      aspectRatio: ratio,
    } as CSSProperties;
    return (
      <div className={styles.visualMedia} style={frameStyle}>
        <button
          type="button"
          className={styles.visualLink}
          data-png={asset.contentType === "image/png" || undefined}
          aria-label={asset.filename}
          aria-haspopup="dialog"
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            onPreview(asset);
          }}
        >
          {source ? (
            video ? (
              <video
                src={source}
                preload="metadata"
                muted
                playsInline
                aria-hidden="true"
                onLoadedMetadata={(event) => {
                  const { videoWidth, videoHeight } = event.currentTarget;
                  if (!dimensions && videoWidth && videoHeight)
                    setNaturalSize({ width: videoWidth, height: videoHeight });
                }}
                onError={() => setFailedSource(source)}
              />
            ) : (
              <img
                src={source}
                alt={asset.filename}
                loading="lazy"
                width={dimensions?.width}
                height={dimensions?.height}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (!dimensions && naturalWidth && naturalHeight)
                    setNaturalSize({ width: naturalWidth, height: naturalHeight });
                }}
                onError={() => setFailedSource(source)}
              />
            )
          ) : (
            <span className={styles.visualPlaceholder}>{asset.filename}</span>
          )}
          {video ? (
            <span className={styles.videoPlay}>
              <Icon name="play" size={24} filled />
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={styles.mediaLink}
        disabled={opening}
        aria-haspopup={canPreview ? "dialog" : undefined}
        onClick={(event) => {
          if (canPreview) {
            event.currentTarget.focus({ preventScroll: true });
            onPreview(asset);
          } else void openFile(event);
        }}
      >
        <span className={styles.fileBadge}>
          <Icon name="file" size={22} />
        </span>
        <span className={styles.fileDetails}>
          <strong>{asset.filename}</strong>
          <small>
            {asset.size < 1024
              ? asset.size + " Б"
              : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
                  asset.size / 1024,
                ) + " КБ"}
          </small>
        </span>
      </button>
      {openError ? <p role="alert">{openError}</p> : null}
      {download && Date.parse(download.expiresAt) > Date.now() ? (
        <a
          href={download.url}
          target="_blank"
          rel="noopener noreferrer"
          download={download.url.startsWith("blob:") ? asset.filename : undefined}
        >
          {download.url.startsWith("blob:") ? "Скачать файл" : "Открыть файл"}
        </a>
      ) : null}
    </div>
  );
}
