import {
  deleteMessage,
  pinMessage,
  toggleReaction,
  type LocalMessage,
} from "@dio/messenger-core";
import { Icon } from "@dio/messenger-ui";
import { useLayoutEffect, useRef, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import { MessageReaders } from "../features/read/MessageReaders.js";
import styles from "./MessageTimeline.module.css";

const MENU_REACTIONS = ["❤️", "👍", "🔥", "🎉", "🤝", "👀"];

export function MessageContextMenu(props: {
  anchor: DOMRect;
  quote: string;
  message: LocalMessage;
  conversationId: string;
  userId?: string;
  onClose: () => void;
  onCreateTicket?: (id: string) => void;
  onShowReaders: (id: string, anchor: DOMRect) => void;
}) {
  const { db, accountKey, sync } = useRuntime();
  const setReply = useUiStore((s) => s.setReplyTarget);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const setForward = useUiStore((s) => s.setForwardTarget);
  const { message, conversationId, userId, onClose, anchor, quote } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    left: anchor.left,
    top: Math.max(8, anchor.top - 8),
  });

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
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({
      preventScroll: true,
    });
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

  const fragment = quote;

  return (
    <div
      ref={rootRef}
      className={styles.contextPopover}
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        event.preventDefault();
        buttons[(index + step + buttons.length) % buttons.length]?.focus();
      }}
    >
      {!message.deletedAt && userId ? (
        <div className={styles.reactionBar} role="toolbar" aria-label="Реакции">
          {MENU_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.reactionPick}
              onClick={() => act(() => react(emoji))}
            >
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
                quoteText: Array.from(fragment).slice(0, 280).join(""),
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
        {props.onCreateTicket && message.serverId && !message.deletedAt ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => act(() => props.onCreateTicket!(message.serverId!))}
          >
            <Icon name="hash" size={18} /> Создать заявку
          </button>
        ) : null}
        {!message.deletedAt && db && accountKey ? (
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              act(
                () =>
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
        {message.isOutgoing &&
        message.serverId &&
        !message.deletedAt &&
        !message.pollId ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => act(() => setEditing(message.localId))}
          >
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
        {message.isOutgoing && message.serverId && !message.deletedAt && (
          <MessageReaders
            conversationId={conversationId}
            messageId={message.serverId}
            expanded={false}
            onExpand={(readerAnchor) =>
              act(() => props.onShowReaders(message.serverId!, readerAnchor))
            }
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
