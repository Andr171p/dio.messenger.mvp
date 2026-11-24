import { Icon, IconButton } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { HttpError, type components } from "@dio/messenger-core";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import styles from "./MessageTimeline.module.css";

function requiresMediaProxy(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    (window.location.protocol === "https:" ||
      (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.hostname !== window.location.hostname))
  );
}

export function MessageMedia({ assetId }: { assetId: string }) {
  const { http } = useRuntime();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [failedSource, setFailedSource] = useState<string>();
  const [proxyFailed, setProxyFailed] = useState(false);
  const [blobSource, setBlobSource] = useState<string>();
  const downloadObjectUrl = useRef<string | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const [download, setDownload] = useState<
    components["schemas"]["MediaAccessDTO"] | null
  >(null);
  const metadata = useQuery({
    queryKey: ["media-metadata", assetId],
    enabled: !!http,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "uploaded" || status === "scanning" ? 3_000 : false;
    },
    queryFn: () =>
      http!.get<components["schemas"]["MediaAssetDTO"]>(`/v1/media/${assetId}`),
  });
  const asset = metadata.data;
  const image = asset?.contentType.startsWith("image/");
  const video = asset?.contentType.startsWith("video/");
  const audio = asset?.contentType.startsWith("audio/");
  const canPreview = image || video || audio;
  const access = useQuery({
    queryKey: ["media-access", assetId],
    enabled: !!http && (!!image || previewOpen) && asset?.status === "ready",
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const expires = query.state.data?.expiresAt;
      return expires
        ? Math.max(5_000, Date.parse(expires) - Date.now() - 5_000)
        : false;
    },
    queryFn: () =>
      http!.post<components["schemas"]["MediaAccessDTO"]>(
        `/v1/media/${assetId}/access`,
        { role: "original" },
      ),
  });
  const signedSource = access.data?.url;
  const parsedSource =
    signedSource && URL.canParse(signedSource) ? new URL(signedSource) : null;
  const useProxy = !!parsedSource && requiresMediaProxy(parsedSource);
  const source = useProxy ? blobSource : signedSource;
  const readProxy = !!http && useProxy && (!!image || previewOpen);
  useEffect(() => {
    if (!http || !readProxy) return;
    const controller = new AbortController();
    let url: string | undefined;
    setBlobSource(undefined);
    setProxyFailed(false);
    void http
      .request<Blob>(`/v1/media/${assetId}/content`, {
        responseType: "blob",
        timeoutMs: 90_000,
        signal: controller.signal,
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setBlobSource(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProxyFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId, http, readProxy]);
  useEffect(
    () => () => {
      if (downloadObjectUrl.current) URL.revokeObjectURL(downloadObjectUrl.current);
    },
    [],
  );
  useEffect(() => {
    if (previewOpen && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [previewOpen]);

  async function openFile(event: MouseEvent<HTMLButtonElement>) {
    if (!http || opening) return;
    const opener = event.currentTarget;
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;
    setOpening(true);
    setOpenError("");
    setDownload(null);
    try {
      const signed = await http.post<components["schemas"]["MediaAccessDTO"]>(
        `/v1/media/${assetId}/access`,
        { role: "original" },
      );
      const url = new URL(signed.url);
      if (requiresMediaProxy(url)) {
        target?.close();
        const blob = await http.request<Blob>(`/v1/media/${assetId}/content`, {
          responseType: "blob",
          timeoutMs: 90_000,
        });
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
      setOpenError(
        error instanceof HttpError && [403, 404, 410].includes(error.status)
          ? "Нет доступа к файлу"
          : "Не удалось открыть файл. Повторите попытку.",
      );
      opener.focus();
    } finally {
      setOpening(false);
    }
  }

  if (metadata.isError || asset?.status === "rejected" || asset?.status === "deleted") {
    return <div className={styles.mediaPlaceholder}>Вложение недоступно</div>;
  }
  if (!asset || asset.status !== "ready") {
    return (
      <div className={styles.mediaPlaceholder} role="status">
        {asset?.filename ?? "Вложение"} ·{" "}
        {asset && asset.status !== "ready" ? "Проверяется" : "Загрузка…"}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={[
          styles.mediaLink,
          image && source && failedSource !== source ? styles.imageLink : "",
        ].join(" ")}
        disabled={opening}
        aria-haspopup={canPreview ? "dialog" : undefined}
        onClick={(event) => {
          if (canPreview) {
            event.currentTarget.focus({ preventScroll: true });
            setPreviewOpen(true);
          } else void openFile(event);
        }}
      >
        {image && source && failedSource !== source && !access.isError ? (
          <img
            className={styles.mediaImg}
            src={source}
            alt={asset.filename}
            loading="lazy"
            onError={() => setFailedSource(source)}
          />
        ) : (
          <>
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
          </>
        )}
      </button>
      {!previewOpen && openError ? <p role="alert">{openError}</p> : null}
      {!previewOpen && download && Date.parse(download.expiresAt) > Date.now() ? (
        <a
          href={download.url}
          target="_blank"
          rel="noopener noreferrer"
          download={download.url.startsWith("blob:") ? asset.filename : undefined}
        >
          {download.url.startsWith("blob:") ? "Скачать файл" : "Открыть файл"}
        </a>
      ) : null}
      {previewOpen ? (
        <dialog
          ref={dialog}
          className={styles.mediaDialog}
          aria-label={"Предпросмотр " + asset.filename}
          onClose={() => {
            setPreviewOpen(false);
            setOpenError("");
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <header>
            <strong>{asset.filename}</strong>
            {useProxy && blobSource ? (
              <a href={blobSource} download={asset.filename}>
                Скачать файл
              </a>
            ) : (
              <button
                type="button"
                disabled={opening}
                onClick={(event) => void openFile(event)}
              >
                Открыть файл
              </button>
            )}
            <IconButton
              label="Закрыть предпросмотр"
              icon="close"
              size="sm"
              onClick={() => dialog.current?.close()}
            />
          </header>
          {access.isError ||
          (useProxy && proxyFailed) ||
          (!!source && failedSource === source) ? (
            <p role="status">Предпросмотр недоступен</p>
          ) : !source ? (
            <p role="status">Загрузка…</p>
          ) : image ? (
            <img
              src={source}
              alt={asset.filename}
              onError={() => setFailedSource(source)}
            />
          ) : video ? (
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
          {openError ? <p role="alert">{openError}</p> : null}
          {download && Date.parse(download.expiresAt) > Date.now() ? (
            <a href={download.url} target="_blank" rel="noopener noreferrer">
              Открыть файл в новой вкладке
            </a>
          ) : null}
        </dialog>
      ) : null}
    </div>
  );
}
