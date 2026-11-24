import { Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { HttpError, type components } from "@dio/messenger-core";
import { useState, type MouseEvent } from "react";
import styles from "./MessageTimeline.module.css";

export function MessageMedia({ assetId }: { assetId: string }) {
  const { http } = useRuntime();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
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
  const access = useQuery({
    queryKey: ["media-access", assetId],
    enabled: !!http && !!image && asset?.status === "ready",
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
        className={styles.mediaLink}
        disabled={opening}
        onClick={(event) => void openFile(event)}
      >
        {image && access.data?.url && !access.isError ? (
          <img
            className={styles.mediaImg}
            src={access.data.url}
            alt={asset.filename}
            loading="lazy"
          />
        ) : (
          <span className={styles.mediaPlaceholder}>
            <Icon name="attach" size={16} />
            {asset.filename} · {Math.max(1, Math.round(asset.size / 1024))} КБ
          </span>
        )}
      </button>
      {openError ? <p role="alert">{openError}</p> : null}
      {download && Date.parse(download.expiresAt) > Date.now() ? (
        <a href={download.url} target="_blank" rel="noopener noreferrer">
          Открыть файл
        </a>
      ) : null}
    </div>
  );
}
