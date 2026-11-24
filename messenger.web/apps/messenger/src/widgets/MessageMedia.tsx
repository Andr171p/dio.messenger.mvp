import { Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import type { components } from "@dio/messenger-core";
import styles from "./MessageTimeline.module.css";

export function MessageMedia({ assetId }: { assetId: string }) {
  const { http } = useRuntime();
  const metadata = useQuery({
    queryKey: ["media-metadata", assetId],
    enabled: !!http,
    queryFn: () =>
      http!.get<components["schemas"]["MediaAssetDTO"]>(`/v1/media/${assetId}`),
  });
  const asset = metadata.data;
  const image = asset?.contentType.startsWith("image/");
  const access = useQuery({
    queryKey: ["media-access", assetId],
    enabled: !!http && asset?.status === "ready",
    staleTime: 0,
    queryFn: () =>
      http!.post<components["schemas"]["MediaAccessDTO"]>(
        `/v1/media/${assetId}/access`,
        { role: "original" },
      ),
  });

  if (
    metadata.isError ||
    access.isError ||
    asset?.status === "rejected" ||
    asset?.status === "deleted"
  ) {
    return <div className={styles.mediaPlaceholder}>Вложение недоступно</div>;
  }
  if (!asset || !access.data?.url) {
    return (
      <div className={styles.mediaPlaceholder} role="status">
        {asset?.filename ?? "Вложение"} ·{" "}
        {asset && asset.status !== "ready" ? "Проверяется" : "Загрузка…"}
      </div>
    );
  }

  return (
    <a
      className={styles.mediaLink}
      href={access.data.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {image ? (
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
    </a>
  );
}
