import { extractBlocks, type components } from "@dio/messenger-core";
import { Button } from "@dio/messenger-ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { MessageMedia } from "./MessageMedia.js";
import { MediaViewer, type MediaSelection } from "./MediaViewer.js";
import { useMediaSource } from "./useMediaSource.js";
import styles from "./NewChatModal.module.css";

const categories = [
  ["image", "Фото"],
  ["video", "Видео"],
  ["audio", "Аудио и голосовые"],
  ["file", "Файлы"],
  ["link", "Ссылки"],
] as const;
type Category = (typeof categories)[number][0];
type Message = components["schemas"]["MessageDTO"];
type Attachment = Extract<ReturnType<typeof extractBlocks>[number], { type: "media" }>;

function linksIn(text: string) {
  const pattern =
    /\[([^\]\n]+)\]\((https?:\/\/[^\s()<>"']+)\)|(https?:\/\/[^\s<>"']+)/gi;
  return [...text.matchAll(pattern)].flatMap((match) => {
    const href = match[2] ?? match[3]!.replace(/[.,;!?)}\]]+$/, "");
    const url = URL.canParse(href) ? new URL(href) : undefined;
    return url && ["http:", "https:"].includes(url.protocol)
      ? [{ href: url.href, host: url.hostname, title: match[1] || url.hostname }]
      : [];
  });
}

function SharedAttachment({
  block,
  category,
  onOpen,
}: {
  block: Attachment;
  category: Category;
  onOpen: (file: Pick<MediaSelection, "filename" | "contentType">) => void;
}) {
  const { metadata } = useMediaSource(block.assetId);
  const mime = metadata.data?.contentType.split("/")[0];
  const kind = mime === "image" || mime === "video" || mime === "audio" ? mime : "file";
  if (!metadata.data || kind !== category) return null;
  return (
    <div className={styles.sharedAttachment}>
      <MessageMedia
        assetId={block.assetId}
        presentation={
          category === "file"
            ? "file"
            : block.presentation === "voice"
              ? "voice"
              : undefined
        }
        onPreview={onOpen}
      />
    </div>
  );
}

export function ChatSharedContent({ conversationId }: { conversationId: string }) {
  const { http, accountKey } = useRuntime();
  const [category, select] = useState<Category>();
  const [media, setMedia] = useState<MediaSelection>();
  const messages = useInfiniteQuery({
    queryKey: ["chat-shared-content", accountKey, conversationId],
    enabled: !!http && !!category,
    initialPageParam: 0,
    staleTime: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "50" });
      if (pageParam) params.set("beforeSeq", String(pageParam));
      return http!.request<Message[]>(
        `/v1/conversations/${conversationId}/messages?${params}`,
        { signal },
      );
    },
    getNextPageParam: (page) => (page.length === 50 ? page[0]?.createdSeq : undefined),
  });

  return (
    <section className={styles.sharedSection} aria-label="Общие материалы">
      <h3>Общие материалы</h3>
      <div className={styles.sharedCategories}>
        {categories.map(([id, name]) => (
          <button
            type="button"
            key={id}
            className={styles.userRow}
            aria-pressed={category === id}
            onClick={() => select(category === id ? undefined : id)}
          >
            {name}
          </button>
        ))}
      </div>
      {category && (
        <>
          {messages.isPending && <p role="status">Загружаем материалы…</p>}
          {messages.isError && <p role="status">Материалы пока недоступны.</p>}
          <div className={styles.sharedResults}>
            {messages.data?.pages
              .flatMap((page) => [...page].reverse())
              .filter((message) => !message.deletedAt)
              .map((message) =>
                extractBlocks(message.content).map((block, index) => {
                  const key = message.id + ":" + index;
                  if (category === "link" && block.type === "text") {
                    const context = block.text.replace(/\|\|[^\n]*?(?:\|\||$)/gm, "");
                    return linksIn(context).map((link, linkIndex) => (
                      <a
                        className={styles.linkCard}
                        key={key + ":" + linkIndex}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <small>{link.host}</small>
                        <strong>{link.title}</strong>
                        <span>{link.href}</span>
                        <small>
                          {context.length > 160 ? context.slice(0, 160) + "…" : context}
                        </small>
                      </a>
                    ));
                  }
                  if (category !== "link" && block.type === "media") {
                    return (
                      <SharedAttachment
                        key={key}
                        block={block}
                        category={category}
                        onOpen={(file) =>
                          setMedia({
                            ...file,
                            assetId: block.assetId,
                            messageId: message.id,
                            conversationId,
                            authorName: "Участник",
                            sentAt: Date.parse(message.createdAt),
                          })
                        }
                      />
                    );
                  }
                  return null;
                }),
              )}
          </div>
          {!messages.isPending && !messages.isError && (
            <p className={styles.emptyShared}>
              В загруженных сообщениях нет материалов этой категории.
            </p>
          )}
          {messages.hasNextPage && (
            <Button
              variant="ghost"
              disabled={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}
            >
              Загрузить более ранние
            </Button>
          )}
        </>
      )}
      {media && <MediaViewer initial={media} onClose={() => setMedia(undefined)} />}
    </section>
  );
}
