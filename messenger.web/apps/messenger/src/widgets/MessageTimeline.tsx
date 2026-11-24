import {
  deleteMessage,
  extractTicketNumber,
  pinMessage,
  toggleReaction,
  type ContentBlock,
  type LocalMessage,
} from "@dio/messenger-core";
import { Badge, Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useReadCursor } from "../features/read/useReadCursor.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./MessageTimeline.module.css";

const MENU_REACTIONS = ["❤️", "👍", "🔥", "🎉", "🤝", "👀"];

function statusLabel(status: LocalMessage["sendStatus"]): string {
  switch (status) {
    case "queued":
      return "В очереди";
    case "sending":
      return "Отправка";
    case "retrying":
      return "Повтор";
    case "failed":
      return "Ошибка";
    case "sent":
    default:
      return "";
  }
}

function formatDay(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(ts);
}

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

function messageBlocks(message: LocalMessage): ContentBlock[] {
  if (message.contentBlocks) {
    try {
      const parsed = JSON.parse(message.contentBlocks) as ContentBlock[];
      if (parsed.length) return parsed;
    } catch {
      /* fall through */
    }
  }
  return [{ type: "text", text: message.content }];
}

function findTicketResource(message: LocalMessage): {
  number: string | null;
  uuid: string | null;
} {
  for (const block of messageBlocks(message)) {
    if (block.type === "resource") {
      return {
        number: block.number ?? extractTicketNumber(message.content),
        uuid: block.resourceId,
      };
    }
  }
  return { number: extractTicketNumber(message.content), uuid: null };
}

function MediaBlock({ assetId }: { assetId: string }) {
  const { http } = useRuntime();
  const access = useQuery({
    queryKey: ["media-access", assetId],
    enabled: !!http,
    staleTime: 60_000,
    queryFn: async () =>
      http!.post<{ url: string }>(`/v1/media/${assetId}/access`, { role: "preview" }),
  });

  if (access.data?.url) {
    return (
      <a className={styles.mediaLink} href={access.data.url} target="_blank" rel="noreferrer">
        <img className={styles.mediaImg} src={access.data.url} alt="Вложение" loading="lazy" />
      </a>
    );
  }

  return (
    <div className={styles.mediaPlaceholder}>
      <Icon name="attach" size={16} /> Вложение
      {access.isFetching ? " …" : null}
    </div>
  );
}

export function MessageTimeline() {
  const { db, accountKey, sync } = useRuntime();
  const { session } = useAuth();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const setReply = useUiStore((s) => s.setReplyTarget);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const setForward = useUiStore((s) => s.setForwardTarget);
  const setContext = useUiStore((s) => s.setContextResource);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{
    message: LocalMessage;
    anchor: DOMRect;
    quote: string;
  } | null>(null);

  const messages = useLiveQuery(async () => {
    if (!db || !accountKey || !conversationId) return [] as LocalMessage[];
    const rows = await db.messages
      .where("[accountKey+conversationId]")
      .equals([accountKey, conversationId])
      .toArray();
    return rows.sort((a, b) => (a.createdSeq ?? a.createdAt) - (b.createdSeq ?? b.createdAt));
  }, [db, accountKey, conversationId]);

  const items = messages ?? [];
  useReadCursor(conversationId, items, parentRef);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 12,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const virtualItems = virtualizer.getVirtualItems();

  if (!conversationId) {
    return (
      <div className={styles.empty}>
        <p>Выберите беседу, чтобы начать переписку.</p>
      </div>
    );
  }

  return (
    <>
      <div ref={parentRef} className={[styles.scroller, "dio-scroll"].join(" ")}>
        <div
          className={styles.inner}
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualItems.map((row) => {
            const message = items[row.index];
            if (!message) return null;
            const prev = items[row.index - 1];
            const showDate = !prev || !sameDay(prev.createdAt, message.createdAt);
            const grouped =
              !!prev &&
              !showDate &&
              prev.authorId === message.authorId &&
              message.createdAt - prev.createdAt < 5 * 60_000;
            const next = items[row.index + 1];
            const authorBreak =
              !next ||
              next.authorId !== message.authorId ||
              !sameDay(message.createdAt, next.createdAt);
            const status = statusLabel(message.sendStatus);
            const ticket = findTicketResource(message);
            const readSeq = message.createdSeq ?? 0;

            return (
              <div
                key={message.localId}
                ref={virtualizer.measureElement}
                data-index={row.index}
                data-read-seq={readSeq > 0 ? String(readSeq) : undefined}
                className={[
                  styles.row,
                  grouped ? styles.rowGrouped : "",
                  authorBreak ? styles.rowBreak : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                }}
              >
                {showDate ? (
                  <div className={styles.dateSep}>{formatDay(message.createdAt)}</div>
                ) : null}
                <div
                  className={[
                    styles.bubbleWrap,
                    message.isOutgoing ? styles.alignOut : styles.alignIn,
                  ].join(" ")}
                >
                  <MessageBubble
                    message={message}
                    status={status}
                    ticket={ticket}
                    blocks={messageBlocks(message)}
                    grouped={grouped}
                    setReply={setReply}
                    setEditing={setEditing}
                    setForward={setForward}
                    setContext={setContext}
                    openMenu={(e) => {
                      e.preventDefault();
                      const selected = window.getSelection()?.toString().trim() ?? "";
                      setMenu({
                        message,
                        anchor: e.currentTarget.getBoundingClientRect(),
                        quote: selected,
                      });
                    }}
                    db={db}
                    accountKey={accountKey}
                    conversationId={conversationId}
                    userId={session?.userId}
                    sync={sync}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {menu ? (
        <ContextMenu
          anchor={menu.anchor}
          quote={menu.quote}
          message={menu.message}
          conversationId={conversationId}
          userId={session?.userId}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

function ContextMenu(props: {
  anchor: DOMRect;
  quote: string;
  message: LocalMessage;
  conversationId: string;
  userId?: string;
  onClose: () => void;
}) {
  const { db, accountKey, sync } = useRuntime();
  const setReply = useUiStore((s) => s.setReplyTarget);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const setForward = useUiStore((s) => s.setForwardTarget);
  const { message, conversationId, userId, onClose, anchor, quote } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: Math.max(8, anchor.top - 8) });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    // Sit just above the bubble, overlapping it by a few pixels (Telegram-style).
    let top = anchor.top - box.height + 28;
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - box.height - 8));
    setPos({ left, top });
  }, [anchor]);

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  const react = (emoji: string) => {
    if (!db || !accountKey || !userId || message.deletedAt) return;
    void toggleReaction(db, accountKey, {
      conversationId,
      localId: message.localId,
      emoji,
      userId,
    }).then(() => sync?.requestFlush());
  };

  const fragment = quote || message.content;

  return (
    <div
      ref={rootRef}
      className={styles.contextPopover}
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!message.deletedAt && userId ? (
        <div className={styles.reactionBar} role="toolbar" aria-label="Реакции">
          {MENU_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" className={styles.reactionPick} onClick={() => act(() => react(emoji))}>
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.contextMenu} role="menu">
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            act(() =>
              setReply({
                localId: message.localId,
                serverId: message.serverId,
                preview: message.content,
              }),
            )
          }
        >
          <Icon name="reply" size={18} /> Ответить
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!fragment.trim() || !!message.deletedAt}
          onClick={() =>
            act(() =>
              setReply({
                localId: message.localId,
                serverId: message.serverId,
                preview: message.content,
                quoteText: fragment.slice(0, 280),
              }),
            )
          }
        >
          <Icon name="quote" size={18} /> Цитировать фрагмент
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            act(() => {
              const text = (quote || message.content).trim();
              if (text) void navigator.clipboard.writeText(text);
            })
          }
        >
          <Icon name="copy" size={18} /> Копировать текст
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            act(() =>
              setForward({
                localId: message.localId,
                serverId: message.serverId,
                preview: message.content,
                conversationId,
              }),
            )
          }
        >
          <Icon name="forward" size={18} /> Переслать
        </button>
        {!message.deletedAt && db && accountKey ? (
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              act(() =>
                void pinMessage(db, accountKey, {
                  conversationId,
                  localId: message.localId,
                  pin: !message.isPinned,
                }).then(() => sync?.requestFlush()),
              )
            }
          >
            <Icon name="pin" size={18} /> {message.isPinned ? "Открепить" : "Закрепить"}
          </button>
        ) : null}
        {message.isOutgoing && !message.deletedAt ? (
          <button type="button" role="menuitem" onClick={() => act(() => setEditing(message.localId))}>
            <Icon name="edit" size={18} /> Редактировать
          </button>
        ) : null}
        {message.isOutgoing && !message.deletedAt && userId && db && accountKey ? (
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              act(() => {
                void deleteMessage(db, accountKey, {
                  conversationId,
                  localId: message.localId,
                  authorId: userId,
                }).then(() => sync?.requestFlush());
              })
            }
          >
            Удалить
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble(props: {
  message: LocalMessage;
  status: string;
  ticket: { number: string | null; uuid: string | null };
  blocks: ContentBlock[];
  grouped?: boolean;
  setReply: ReturnType<typeof useUiStore.getState>["setReplyTarget"];
  setEditing: ReturnType<typeof useUiStore.getState>["setEditingMessageId"];
  setForward: ReturnType<typeof useUiStore.getState>["setForwardTarget"];
  setContext: ReturnType<typeof useUiStore.getState>["setContextResource"];
  openMenu: (e: React.MouseEvent) => void;
  db: ReturnType<typeof useRuntime>["db"];
  accountKey: string | null;
  conversationId: string;
  userId?: string;
  sync: ReturnType<typeof useRuntime>["sync"];
}) {
  const { message, status, ticket, blocks, grouped } = props;

  const receipt = useMemo(() => {
    if (!message.isOutgoing || message.sendStatus !== "sent") return null;
    if (message.deliveryStatus === "read") {
      return <Icon name="check-double" context="status" className={styles.checksRead} />;
    }
    if (message.deliveryStatus === "delivered") {
      return <Icon name="check-double" context="status" className={styles.checks} />;
    }
    return <Icon name="check" context="status" className={styles.checks} />;
  }, [message]);

  const openTicket = () => {
    const label = ticket.number ?? ticket.uuid ?? "";
    props.setContext(label, ticket.uuid);
  };

  return (
    <div
      className={[
        styles.bubble,
        "dio-message-text",
        message.isOutgoing ? styles.outgoing : styles.incoming,
        message.deletedAt ? styles.deleted : "",
        message.isPinned ? styles.pinned : "",
      ].join(" ")}
      tabIndex={-1}
      onContextMenu={props.openMenu}
    >
      {!message.isOutgoing && !message.deletedAt && !grouped ? (
        <span className={styles.author}>
          {message.authorDisplayName ?? message.authorId.slice(0, 8)}
        </span>
      ) : null}
      {message.forwardedFrom ? (
        <span className={styles.forwarded}>
          Переслано
          {message.forwardedFrom.text ? ` · ${message.forwardedFrom.text.slice(0, 80)}` : ""}
        </span>
      ) : null}
      {(message.replyPreview || message.quoteText) && !message.deletedAt ? (
        <span className={styles.reply}>
          {message.quoteText ? `«${message.quoteText}»` : message.replyPreview}
        </span>
      ) : null}
      {!message.deletedAt ? (
        <MessageBody blocks={blocks} />
      ) : (
        <p className={styles.text}>Сообщение удалено</p>
      )}
      {ticket.number || ticket.uuid ? (
        <button type="button" className={styles.ticketCard} onClick={openTicket}>
          <span className={styles.ticketLabel}>Заявка</span>
          <strong>#{ticket.number ?? ticket.uuid}</strong>
          <span className={styles.ticketHint}>Открыть контекст →</span>
        </button>
      ) : null}
      <div className={styles.footer}>
        {status ? <Badge tone="neutral">{status}</Badge> : null}
        {message.reactions
          ? Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                type="button"
                key={emoji}
                className={styles.reaction}
                title={users.join(", ")}
                onClick={() => {
                  if (!props.db || !props.accountKey || !props.userId) return;
                  void toggleReaction(props.db, props.accountKey, {
                    conversationId: props.conversationId,
                    localId: message.localId,
                    emoji,
                    userId: props.userId,
                  }).then(() => props.sync?.requestFlush());
                }}
              >
                {emoji} {users.length}
              </button>
            ))
          : null}
        <span className={styles.meta}>
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {formatClock(message.createdAt)}
          </time>
          {receipt}
        </span>
      </div>
    </div>
  );
}

function MessageBody({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className={styles.blockStack}>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <p key={`t-${index}`} className={styles.text}>
              {block.text}
            </p>
          );
        }
        if (block.type === "media") {
          return <MediaBlock key={`m-${block.assetId}`} assetId={block.assetId} />;
        }
        if (block.type === "quote") {
          return (
            <blockquote key={`q-${index}`} className={styles.quoteBlock}>
              {block.text}
            </blockquote>
          );
        }
        if (block.type === "resource") {
          return (
            <p key={`r-${index}`} className={styles.text}>
              {block.number ? `#${block.number}` : block.resourceId}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}