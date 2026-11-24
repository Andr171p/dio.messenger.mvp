import {
  extractTicketNumber,
  toggleReaction,
  type ContentBlock,
  type LocalMessage,
} from "@dio/messenger-core";
import { Badge, Icon } from "@dio/messenger-ui";
import { useState } from "react";
import type { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import { MessageMedia } from "./MessageMedia.js";
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
  replyPreview?: string;
  receiptCount?: { seen: number; total: number };
  db: ReturnType<typeof useRuntime>["db"];
  accountKey: string | null;
  conversationId: string;
  userId?: string;
  sync: ReturnType<typeof useRuntime>["sync"];
}) {
  const { message, status, blocks, grouped } = props;
  const [receiptOpen, setReceiptOpen] = useState(false);
  const seen = props.receiptCount?.seen ?? 0;
  const receipt =
    message.isOutgoing && message.sendStatus === "sent" ? (
      <button
        type="button"
        className={styles.receipt}
        aria-label={
          seen
            ? `Прочитали ${seen} из ${props.receiptCount?.total}`
            : "Принято сервером"
        }
        aria-expanded={seen ? receiptOpen : undefined}
        onClick={() => {
          if (seen) setReceiptOpen((open) => !open);
        }}
        disabled={!seen}
      >
        <Icon
          name={seen ? "check-double" : "check"}
          context="status"
          className={seen ? styles.checksRead : styles.checks}
        />
      </button>
    ) : null;

  const legacyTicket = blocks.some((block) => block.type === "resource")
    ? null
    : extractTicketNumber(message.content);

  return (
    <div
      className={[
        styles.bubble,
        "dio-message-text",
        message.isOutgoing ? styles.outgoing : styles.incoming,
        message.deletedAt ? styles.deleted : "",
        message.isPinned ? styles.pinned : "",
      ].join(" ")}
      tabIndex={0}
      onContextMenu={props.openMenu}
      onKeyDown={(event) => {
        if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu")
          props.openMenu(event);
      }}
    >
      {!message.isOutgoing && !message.deletedAt && !grouped ? (
        <span className={styles.author}>{message.authorDisplayName ?? "Участник"}</span>
      ) : null}
      {message.forwardedFrom && !message.deletedAt ? (
        <span className={styles.forwarded}>
          Переслано
          {message.forwardedFrom.text
            ? ` · ${message.forwardedFrom.text.slice(0, 80)}`
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
            : (props.replyPreview ?? message.replyPreview ?? "К исходному сообщению")}
        </button>
      ) : null}
      {!message.deletedAt ? (
        <MessageBody blocks={blocks} conversationId={props.conversationId} />
      ) : (
        <p className={styles.text}>Сообщение удалено</p>
      )}
      {!message.deletedAt && legacyTicket ? (
        <TicketCard number={legacyTicket} conversationId={props.conversationId} />
      ) : null}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.messageActions}
          onClick={props.openMenu}
          aria-label="Действия с сообщением"
          aria-haspopup="menu"
        >
          <Icon name="more-vertical" size={16} />
        </button>
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
  );
}

function MessageBody({
  blocks,
  conversationId,
}: {
  blocks: ContentBlock[];
  conversationId: string;
}) {
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
          return <MessageMedia key={`m-${block.assetId}`} assetId={block.assetId} />;
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
            <TicketCard
              key={index}
              uuid={block.resourceId}
              number={block.number}
              conversationId={conversationId}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
