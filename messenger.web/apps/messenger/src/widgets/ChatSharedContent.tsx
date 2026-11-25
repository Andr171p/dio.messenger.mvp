import { extractBlocks, type components } from "@dio/messenger-core";
import { Button, Icon } from "@dio/messenger-ui";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { ChatDialog } from "./ChatDialog.js";
import { MessageMedia } from "./MessageMedia.js";
import { MediaViewer, type MediaSelection } from "./MediaViewer.js";
import styles from "./NewChatModal.module.css";

const categories = [
  ["image", "Фото", "image"],
  ["video", "Видео", "video"],
  ["file", "Файлы", "file"],
  ["link", "Ссылки", "link"],
  ["audio", "Аудио и голосовые", "mic"],
] as const;
type Category = (typeof categories)[number][0];
type Message = components["schemas"]["MessageDTO"];
type Asset = components["schemas"]["MediaAssetDTO"];
const month = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

function linksIn(text: string) {
  const context = text.replace(/\|\|[^\n]*?(?:\|\||$)/gm, "");
  const pattern =
    /\[([^\]\n]+)\]\((https?:\/\/[^\s()<>"']+)\)|(https?:\/\/[^\s<>"']+)/gi;
  return [...context.matchAll(pattern)].flatMap((match) => {
    const href = match[2] ?? match[3]!.replace(/[.,;!?)}\]]+$/, "");
    const url = URL.canParse(href) ? new URL(href) : undefined;
    return url && ["https:", "http:"].includes(url.protocol)
      ? [
          {
            href: url.href,
            host: url.hostname,
            title: match[1] || url.hostname,
            context: context.slice(0, 160),
          },
        ]
      : [];
  });
}

export function ChatSharedContent({
  conversationId,
  threadId,
}: {
  conversationId: string;
  threadId?: string;
}) {
  const [category, select] = useState<Category>();
  return (
    <section className={styles.sharedSection} aria-label="Общие материалы">
      {categories.map(([id, name, icon]) => (
        <button
          type="button"
          key={id}
          className={styles.mediaCategory}
          onClick={() => select(id)}
        >
          <Icon name={icon} size={23} />
          <span>{name}</span>
        </button>
      ))}
      {category && (
        <SharedAlbum
          conversationId={conversationId}
          threadId={threadId}
          category={category}
          onClose={() => select(undefined)}
        />
      )}
    </section>
  );
}

function SharedAlbum({
  conversationId,
  threadId,
  category,
  onClose,
}: {
  conversationId: string;
  threadId?: string;
  category: Category;
  onClose: () => void;
}) {
  const { http, accountKey } = useRuntime();
  const [media, setMedia] = useState<MediaSelection>();
  const messages = useInfiniteQuery({
    queryKey: ["chat-shared-content", accountKey, conversationId, threadId],
    enabled: !!http,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "50" });
      if (pageParam) params.set("beforeSeq", String(pageParam));
      if (threadId) params.set("threadId", threadId);
      return http!.request<Message[]>(
        `/v1/conversations/${conversationId}/messages?${params}`,
        { signal },
      );
    },
    getNextPageParam: (page) => (page.length === 50 ? page[0]?.createdSeq : undefined),
  });
  const rows = (messages.data?.pages.flat() ?? [])
    .filter((m) => !m.deletedAt)
    .sort((a, b) => b.createdSeq - a.createdSeq);
  const blocks = rows.flatMap((message) =>
    extractBlocks(message.content).map((block, index) => ({
      message,
      block,
      key: message.id + ":" + index,
    })),
  );
  const assetIds = [
    ...new Set(
      blocks.flatMap(({ block }) =>
        category !== "link" && block.type === "media" ? [block.assetId] : [],
      ),
    ),
  ];
  const assets = useQueries({
    queries: assetIds.map((id) => ({
      queryKey: ["media-metadata", id],
      enabled: !!http,
      staleTime: 30_000,
      queryFn: () => http!.get<Asset>("/v1/media/" + id),
    })),
  });
  const byId = new Map(assetIds.map((id, index) => [id, assets[index]?.data]));
  const groups = new Map<string, React.ReactNode[]>();
  for (const { message, block, key } of blocks) {
    const sentAt = Date.parse(message.createdAt);
    if (!Number.isFinite(sentAt)) continue;
    const label = month.format(sentAt);
    let entries: React.ReactNode[] = [];
    if (category === "link" && block.type === "text") {
      entries = linksIn(block.text).map((link, index) => (
        <a
          key={key + ":" + index}
          className={styles.linkCard}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <small>{link.host}</small>
          <strong>{link.title}</strong>
          <span>{link.href}</span>
          <small>{link.context}</small>
        </a>
      ));
    } else if (block.type === "media") {
      const asset = byId.get(block.assetId);
      const mime = asset?.contentType.split("/")[0];
      const kind =
        block.presentation !== "file" &&
        (mime === "image" || mime === "video" || mime === "audio")
          ? mime
          : "file";
      if (asset && kind === category)
        entries = [
          <div key={key} className={styles.sharedAttachment}>
            <MessageMedia
              assetId={block.assetId}
              presentation={block.presentation}
              onPreview={(file) =>
                setMedia({
                  ...file,
                  assetId: block.assetId,
                  messageId: message.id,
                  conversationId,
                  sentAt,
                  authorName: "Участник",
                })
              }
            />
          </div>,
        ];
    }
    if (entries.length) {
      const group = groups.get(label) ?? [];
      group.push(...entries);
      groups.set(label, group);
    }
  }

  const pending = messages.isPending || assets.some((a) => a.isPending);
  return (
    <ChatDialog
      title={categories.find(([id]) => id === category)![1]}
      onClose={onClose}
      onBack={onClose}
    >
      {pending && <p role="status">Загружаем материалы…</p>}
      {messages.isError && <p role="status">Материалы пока недоступны.</p>}
      {!groups.size && !pending && !messages.isError && (
        <p>В загруженных сообщениях нет материалов этой категории.</p>
      )}
      {[...groups].map(([label, entries]) => (
        <section key={label} className={styles.albumGroup}>
          <h3>{label}</h3>
          <div
            className={
              category === "image" || category === "video"
                ? styles.albumGrid
                : styles.albumList
            }
          >
            {entries}
          </div>
        </section>
      ))}
      {messages.hasNextPage && (
        <Button
          variant="ghost"
          disabled={messages.isFetchingNextPage}
          onClick={() => void messages.fetchNextPage()}
        >
          Загрузить более ранние
        </Button>
      )}
      {media && <MediaViewer initial={media} onClose={() => setMedia(undefined)} />}
    </ChatDialog>
  );
}
