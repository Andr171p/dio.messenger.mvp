import {
  deleteMessage,
  extractTicketResourceId,
  toggleReaction,
  type LocalMessage,
} from "@dio/messenger-core";
import { Badge, Button, Icon } from "@dio/messenger-ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useReadCursor } from "../features/read/useReadCursor.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./MessageTimeline.module.css";

const QUICK_EMOJI = ["👍", "❤️", "😂", "🔥", "👀"];

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

export function MessageTimeline() {
  const { db, accountKey, sync } = useRuntime();
  const { session } = useAuth();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const setReply = useUiStore((s) => s.setReplyTarget);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const setContext = useUiStore((s) => s.setContextResource);
  const parentRef = useRef<HTMLDivElement | null>(null);

  const messages = useLiveQuery(async () => {
    if (!db || !accountKey || !conversationId) return [] as LocalMessage[];
    const rows = await db.messages
      .where("[accountKey+conversationId]")
      .equals([accountKey, conversationId])
      .toArray();
    return rows.sort((a, b) => (a.createdSeq ?? a.createdAt) - (b.createdSeq ?? b.createdAt));
  }, [db, accountKey, conversationId]);

  const items = messages ?? [];
  useReadCursor(conversationId, items);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 10,
  });

  if (!conversationId) {
    return (
      <div className={styles.empty}>
        <p>Выберите беседу, чтобы начать переписку.</p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className={[styles.scroller, "dio-chat-pattern"].join(" ")}>
      <div
        className={styles.inner}
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const message = items[row.index];
          if (!message) return null;
          const prev = items[row.index - 1];
          const showDate =
            !prev || !sameDay(prev.createdAt, message.createdAt);
          const status = statusLabel(message.sendStatus);
          const ticketId = extractTicketResourceId(message.content);

          return (
            <div
              key={message.localId}
              className={styles.row}
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
                  ticketId={ticketId}
                  setReply={setReply}
                  setEditing={setEditing}
                  setContext={setContext}
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
  );
}

function MessageBubble(props: {
  message: LocalMessage;
  status: string;
  ticketId: string | null;
  setReply: ReturnType<typeof useUiStore.getState>["setReplyTarget"];
  setEditing: ReturnType<typeof useUiStore.getState>["setEditingMessageId"];
  setContext: ReturnType<typeof useUiStore.getState>["setContextResource"];
  db: ReturnType<typeof useRuntime>["db"];
  accountKey: string | null;
  conversationId: string;
  userId?: string;
  sync: ReturnType<typeof useRuntime>["sync"];
}) {
  const { message, status, ticketId } = props;
  return (
    <div
      className={[
        styles.bubble,
        "dio-message-text",
        message.isOutgoing ? styles.outgoing : styles.incoming,
        message.deletedAt ? styles.deleted : "",
      ].join(" ")}
    >
      {!message.isOutgoing && !message.deletedAt ? (
        <span className={styles.author}>
          {message.authorDisplayName ?? message.authorId.slice(0, 8)}
        </span>
      ) : null}
      {message.replyToId ? (
        <span className={styles.reply}>Ответ на сообщение</span>
      ) : null}
      <p className={styles.text}>
        {message.deletedAt ? "Сообщение удалено" : message.content}
      </p>
      {ticketId ? (
        <button
          type="button"
          className={styles.ticketCard}
          onClick={() => props.setContext(ticketId)}
        >
          <span className={styles.ticketLabel}>Заявка</span>
          <strong>#{ticketId}</strong>
          <span className={styles.ticketHint}>Открыть контекст →</span>
        </button>
      ) : null}
      <div className={styles.footer}>
        {status ? <Badge tone="neutral">{status}</Badge> : null}
        {message.isOutgoing && message.sendStatus === "sent" ? (
          <Icon name="check-double" size={14} className={styles.checks} />
        ) : null}
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
        {!message.deletedAt ? (
          <div className={styles.reactQuick}>
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.reactBtn}
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
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              props.setReply({ localId: message.localId, preview: message.content })
            }
          >
            <Icon name="reply" size={14} /> Ответ
          </Button>
          {message.isOutgoing && !message.deletedAt ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => props.setEditing(message.localId)}
            >
              <Icon name="edit" size={14} />
            </Button>
          ) : null}
          {!message.deletedAt ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!props.db || !props.accountKey) return;
                void deleteMessage(props.db, props.accountKey, {
                  conversationId: props.conversationId,
                  localId: message.localId,
                }).then(() => props.sync?.requestFlush());
              }}
            >
              Удалить
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}