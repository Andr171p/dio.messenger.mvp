import type { components } from "@dio/messenger-core";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import styles from "./LinkPreviewCard.module.css";

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return raw;
  }
}

export function LinkPreviewCard({ url }: { url: string }) {
  const { http } = useRuntime();
  const preview = useQuery({
    queryKey: ["link-preview", url],
    enabled: !!http,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () =>
      http!.get<components["schemas"]["LinkPreviewDTO"]>(
        `/v1/link-preview?${new URLSearchParams({ url })}`,
      ),
  });

  const data = preview.isError ? undefined : preview.data;

  // Страница недоступна или без разметки — оставляем обычную ссылку в тексте.
  if (!data || (!data.title && !data.description && !data.imageUrl)) return null;

  const site = data.siteName ?? hostOf(data.url);

  return (
    <a
      className={styles.card}
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className={styles.meta}>
        <span className={styles.site}>
          {data.faviconUrl ? (
            <img
              className={styles.favicon}
              src={data.faviconUrl}
              alt=""
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          {site}
        </span>
        {data.title ? <strong className={styles.title}>{data.title}</strong> : null}
        {data.description ? (
          <span className={styles.description}>{data.description}</span>
        ) : null}
      </span>
      {data.imageUrl ? (
        <span className={styles.imageWrap}>
          <img
            className={styles.image}
            src={data.imageUrl}
            alt=""
            loading="lazy"
            onError={(event) => {
              const wrap = event.currentTarget.parentElement;
              if (wrap) wrap.style.display = "none";
            }}
          />
        </span>
      ) : null}
    </a>
  );
}
