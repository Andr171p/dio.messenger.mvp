import {
  toggleReaction,
  type ContentBlock,
  type LocalMessage,
} from "@dio/messenger-core";
import { Badge, Icon } from "@dio/messenger-ui";
import { useEffect, useRef, useState } from "react";
import type { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import { MessageMedia } from "./MessageMedia.js";
import { maskSpoilers, MessageFormatting } from "./MessageFormatting.js";
import type { MediaSelection } from "./MediaViewer.js";
import { TicketCard } from "./TicketCard.js";
import styles from "./MessageTimeline.module.css";

function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

export function MessageBubble(props: {
  message: LocalMessage;
  status: string;
  blocks: ContentBlock[];
  grouped?: boolean;
  openMenu: (e: React.MouseEvent | React.KeyboardEvent) => void;
  onPreview: (media: MediaSelection) => void;
  replyPreview?: string;
  receiptCount?: { seen: number; total: number; delivered: boolean };
  db: ReturnType<typeof useRuntime>["db"];
  accountKey: string | null;
  conversationId: string;
  userId?: string;
  sync: ReturnType<typeof useRuntime>["sync"];
}) {
  const { message, status, blocks, grouped } = props;
  const resources = message.deletedAt
    ? []
    : blocks.filter((block) => block.type === "resource");
  const ticketsOnly =
    resources.length > 0 &&
    resources.length === blocks.length &&
    !message.forwardedFrom &&
    !message.replyToId;
  const [receiptOpen, setReceiptOpen] = useState(false);
  const press = useRef<
    { timer: ReturnType<typeof setTimeout>; x: number; y: number } | undefined
  >(undefined);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = undefined;
  };
  useEffect(() => cancelPress, []);
  const seen = props.receiptCount?.seen ?? 0;
  const read = seen > 0 || message.deliveryStatus === "read";
  const delivered =
    props.receiptCount?.delivered ||
    message.deliveryStatus === "delivered";
  const receiptLabel = seen
    ? `Прочитали ${seen} из ${props.receiptCount?.total}`
    : read
      ? "Прочитано"
      : delivered
        ? "Доставлено"
        : "Принято сервером";
  const receipt =
    message.isOutgoing && message.sendStatus === "sent" ? (
      <button
        type="button"
        className={styles.receipt}
        aria-label={receiptLabel}
        title={receiptLabel}
        aria-expanded={seen ? receiptOpen : undefined}
        onClick={() => {
          if (seen) setReceiptOpen((open) => !open);
        }}
        disabled={!seen}
      >
        <Icon
          name={read || delivered ? "check-double" : "check"}
          context="status"
          className={read ? styles.checksRead : styles.checks}
        />
      </button>
    ) : null;
  const attachments = resources.length ? (
    <div className={styles.ticketStack} role="group" aria-label="Прикреплённые заявки">
      {resources.map((block, index) => (
        <TicketCard
          key={index}
          uuid={block.resourceId}
          number={block.number}
          conversationId={props.conversationId}
        />
      ))}
    </div>
  ) : null;

  return (
    <div
      className={[
        styles.messageStack,
        resources.length ? styles.messageStackWithTickets : "",
      ].join(" ")}
      tabIndex={0}
      aria-keyshortcuts="Shift+F10"
      onContextMenu={props.openMenu}
      onPointerDown={(event) => {
        if (
          event.pointerType !== "touch" ||
          (event.target instanceof Element && event.target.closest("button, a"))
        )
          return;
        cancelPress();
        const target = event.currentTarget;
        const { clientX: x, clientY: y } = event;
        press.current = {
          x,
          y,
          timer: setTimeout(() => {
            cancelPress();
            target.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
              }),
            );
          }, 550),
        };
      }}
      onPointerMove={(event) => {
        const start = press.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10)
          cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      onKeyDown={(event) => {
        if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu")
          props.openMenu(event);
      }}
    >
      {ticketsOnly && !message.isOutgoing && !grouped ? (
        <span className={styles.ticketSender}>
          {message.authorDisplayName ?? "Участник"}
        </span>
      ) : null}
      {ticketsOnly ? attachments : null}
      <div
        className={
          ticketsOnly
            ? styles.ticketOnlyMeta
            : [
                styles.bubble,
                "dio-message-text",
                message.isOutgoing ? styles.outgoing : styles.incoming,
                message.deletedAt ? styles.deleted : "",
                message.isPinned ? styles.pinned : "",
              ].join(" ")
        }
      >
        {!ticketsOnly && !message.isOutgoing && !message.deletedAt && !grouped ? (
          <span className={styles.author}>
            {message.authorDisplayName ?? "Участник"}
          </span>
        ) : null}
        {message.forwardedFrom && !message.deletedAt ? (
          <span className={styles.forwarded}>
            Переслано
            {message.forwardedFrom.text
              ? ` · ${maskSpoilers(message.forwardedFrom.text).slice(0, 80)}`
              : ""}
          </span>
        ) : null}
        {message.replyToId && !message.deletedAt ? (
          <button
            type="button"
            className={styles.reply}
            onClick={() =>
              useUiStore.getState().setMessageTarget({ id: message.replyToId! })
            }
          >
            {message.quoteText
              ? `«${message.quoteText}»`
              : maskSpoilers(
                  props.replyPreview ?? message.replyPreview ?? "К исходному сообщению",
                )}
          </button>
        ) : null}
        {!message.deletedAt ? (
          !ticketsOnly && (
            <MessageBody
              blocks={blocks}
              onPreview={(assetId, media) =>
                props.onPreview({
                  ...media,
                  assetId,
                  messageId: message.serverId,
                  conversationId: props.conversationId,
                  authorName: message.isOutgoing
                    ? "Вы"
                    : (message.authorDisplayName ?? "Участник"),
                  sentAt: message.createdAt,
                })
              }
            />
          )
        ) : (
          <p className={styles.text}>Сообщение удалено</p>
        )}
        <div className={styles.footer}>
          {status ? <Badge tone="neutral">{message.sendError ?? status}</Badge> : null}
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
        {receiptOpen && seen ? (
          <p className={styles.receiptCount}>
            Прочитали {seen} из {props.receiptCount?.total}
          </p>
        ) : null}
      </div>
      {!ticketsOnly ? attachments : null}
    </div>
  );
}

function MessageBody({
  blocks,
  onPreview,
}: {
  blocks: ContentBlock[];
  onPreview: (
    assetId: string,
    media: Pick<MediaSelection, "filename" | "contentType">,
  ) => void;
}) {
  return (
    <div className={styles.blockStack}>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <div key={`t-${index}`} className={styles.text}>
              <MessageFormatting
                text={block.text}
                openTicket={(number) => {
                  const resource = blocks.find(
                    (item) =>
                      item.type === "resource" &&
                      item.number?.toUpperCase() === number.toUpperCase(),
                  );
                  useUiStore
                    .getState()
                    .setContextResource(
                      number,
                      resource?.type === "resource" ? resource.resourceId : undefined,
                    );
                }}
              />
            </div>
          );
        }
        if (block.type === "media") {
          return (
            <MessageMedia
              key={`m-${block.assetId}`}
              assetId={block.assetId}
              presentation={block.presentation}
              onPreview={(media) => onPreview(block.assetId, media)}
            />
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={`q-${index}`} className={styles.quoteBlock}>
              {block.text}
            </blockquote>
          );
        }
        return null;
      })}
    </div>
  );
}
