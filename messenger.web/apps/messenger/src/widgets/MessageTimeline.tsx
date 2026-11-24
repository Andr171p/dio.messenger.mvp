import { readMessageBlocks, type LocalMessage } from "@dio/messenger-core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useReadCursor } from "../features/read/useReadCursor.js";
import {
  useConversationMembers,
  useDirectoryProfiles,
} from "../features/read/useConversationMembers.js";
import { useUiStore } from "../stores/uiStore.js";
import { MessageBubble } from "./MessageBubble.js";
import { MessageContextMenu } from "./MessageContextMenu.js";
import { TicketFromMessageDialog } from "./TicketFromMessageDialog.js";
import styles from "./MessageTimeline.module.css";

const RECENT_MESSAGES = 150;

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
  const members = useConversationMembers(conversationId);
  const profiles = useDirectoryProfiles(!!conversationId);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{
    message: LocalMessage;
    anchor: DOMRect;
    quote: string;
  } | null>(null);
  const [historyWindows, setHistoryWindows] = useState<
    Record<string, { through?: number; limit: number }>
  >({});
  const history = conversationId ? historyWindows[conversationId] : undefined;
  const through = history?.through;
  const limit = history?.limit ?? RECENT_MESSAGES;

  const messages = useLiveQuery(async () => {
    if (!db || !accountKey || !conversationId) return null;
    const rows = await db.messages
      .where("[accountKey+conversationId+createdSeq]")
      .between(
        [accountKey, conversationId, 0],
        [accountKey, conversationId, through ?? Number.MAX_SAFE_INTEGER],
        true,
        true,
      )
      .reverse()
      .limit(limit)
      .toArray();
    rows.reverse();
    if (through === undefined) {
      const sends = await db.outbox
        .where("accountKey")
        .equals(accountKey)
        .filter(
          (item) =>
            item.command.type === "message.send" &&
            item.command.payload.conversationId === conversationId,
        )
        .toArray();
      const pending = await db.messages.bulkGet(
        sends.flatMap((item) =>
          item.command.type === "message.send"
            ? [item.command.payload.clientMessageId]
            : [],
        ),
      );
      rows.push(
        ...pending
          .filter((row): row is LocalMessage => !!row && row.createdSeq === undefined)
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    }
    return { conversationId, rows };
  }, [db, accountKey, conversationId, through, limit]);

  const items = useMemo(
    () => (messages?.conversationId === conversationId ? (messages?.rows ?? []) : []),
    [messages, conversationId],
  );
  const byId = useMemo(() => {
    const map = new Map<string, LocalMessage>();
    for (const message of items) {
      map.set(message.localId, message);
      if (message.serverId) map.set(message.serverId, message);
    }
    return map;
  }, [items]);
  useReadCursor(conversationId, items, parentRef);
  const target = useUiStore((s) => s.messageTarget);
  const setTarget = useUiStore((s) => s.setMessageTarget);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [navigationError, setNavigationError] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [ticketSource, setTicketSource] = useState<{
    conversationId: string;
    id: string;
  } | null>(null);
  const myRole = members.data?.find(
    (member) => member.principalId === session?.userId,
  )?.role;
  const positions = useRef(
    new Map<string, { id: string; offset: number; bottom: boolean }>(),
  );
  const nearBottom = useRef(true);
  const previous = useRef<{ conversationId: string; lastId?: string } | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    getItemKey: (index) => items[index]?.localId ?? index,
    overscan: 12,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useLayoutEffect(() => {
    if (!conversationId || !items.length) return;
    const last = items.at(-1);
    const prior = previous.current;
    previous.current = { conversationId, lastId: last?.localId };
    if (prior?.conversationId !== conversationId) {
      setNewMessages(0);
      const saved = positions.current.get(conversationId);
      nearBottom.current = !saved || saved.bottom;
      const index = saved
        ? items.findIndex((message) => message.localId === saved.id)
        : -1;
      if (!nearBottom.current && index >= 0) {
        const offset = virtualizer.getOffsetForIndex(index, "start");
        if (offset) virtualizer.scrollToOffset(offset[0] + (saved?.offset ?? 0));
      } else {
        virtualizer.scrollToIndex(items.length - 1, { align: "end" });
      }
    } else if (prior.lastId !== last?.localId && !target) {
      const previousIndex = items.findIndex(
        (message) => message.localId === prior.lastId,
      );
      const count = previousIndex >= 0 ? items.length - previousIndex - 1 : 0;
      if (nearBottom.current || last?.isOutgoing)
        virtualizer.scrollToIndex(items.length - 1, { align: "end" });
      else if (count > 0) setNewMessages((value) => value + count);
    }
  }, [conversationId, items, target, virtualizer]);

  const targetIndex = target
    ? items.findIndex(
        (message) => message.serverId === target.id || message.localId === target.id,
      )
    : -1;

  useEffect(() => {
    if (!conversationId || !target || targetIndex >= 0 || !sync) return;
    let cancelled = false;
    setNavigationError("");
    const window = target.seq
      ? { beforeSeq: target.seq + 1 }
      : { aroundMessageId: target.id };
    void sync
      .loadHistory(conversationId, window)
      .then((rows) => {
        if (cancelled) return;
        const original = rows.find((row) => row.id === target.id);
        if (original) {
          setHistoryWindows((current) => ({
            ...current,
            [conversationId]: { through: original.createdSeq, limit: RECENT_MESSAGES },
          }));
        } else {
          setNavigationError("Исходное сообщение недоступно");
          setTarget(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNavigationError("Не удалось открыть сообщение");
          setTarget(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, target, targetIndex, sync, setTarget]);

  useLayoutEffect(() => {
    if (!target || targetIndex < 0) return;
    virtualizer.scrollToIndex(targetIndex, { align: "center" });
    setHighlight(items[targetIndex]!.localId);
    setNavigationError("");
    setTarget(null);
  }, [items, target, targetIndex, virtualizer, setTarget]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 2_000);
    return () => clearTimeout(timer);
  }, [highlight]);

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

  useEffect(() => {
    setMenu(null);
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className={styles.empty}>
        <p>Выберите беседу, чтобы начать переписку.</p>
      </div>
    );
  }

  return (
    <>
      {navigationError ? (
        <p role="status" className={styles.jumpNotice}>
          {navigationError}
        </p>
      ) : null}
      {items[0]?.createdSeq && items[0].createdSeq > 1 && sync ? (
        <button
          className={styles.older}
          type="button"
          onClick={() => {
            void sync
              .loadHistory(conversationId, { beforeSeq: items[0]!.createdSeq })
              .then((rows) => {
                if (rows.length) {
                  setHistoryWindows((current) => ({
                    ...current,
                    [conversationId]: { through, limit: limit + RECENT_MESSAGES },
                  }));
                } else setNavigationError("Это начало доступной переписки");
              })
              .catch(() => setNavigationError("Не удалось загрузить историю"));
          }}
        >
          Загрузить предыдущие сообщения
        </button>
      ) : null}
      <div
        ref={parentRef}
        className={[styles.scroller, "dio-scroll"].join(" ")}
        onScroll={(event) => {
          const root = event.currentTarget;
          nearBottom.current =
            root.scrollHeight - root.clientHeight - root.scrollTop < 48;
          if (nearBottom.current) setNewMessages(0);
          const anchor = virtualizer
            .getVirtualItems()
            .find((row) => row.end > root.scrollTop);
          const message = anchor && items[anchor.index];
          if (anchor && message)
            positions.current.set(conversationId, {
              id: message.localId,
              offset: root.scrollTop - anchor.start,
              bottom: nearBottom.current,
            });
        }}
      >
        <div
          className={styles.inner}
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualItems.map((row) => {
            const entry = items[row.index];
            if (!entry) return null;
            const message = {
              ...entry,
              authorDisplayName:
                entry.authorDisplayName ?? profiles.data?.[entry.authorId],
            };
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
            const readSeq = message.createdSeq ?? 0;

            return (
              <div
                key={message.localId}
                ref={virtualizer.measureElement}
                data-index={row.index}
                data-read-seq={readSeq > 0 ? String(readSeq) : undefined}
                className={[
                  styles.row,
                  highlight === message.localId ? styles.highlight : "",
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
                    receiptCount={
                      message.isOutgoing && readSeq > 0 && members.data
                        ? {
                            total: members.data.filter(
                              (member) =>
                                member.principalId !== session?.userId &&
                                member.historyFromSeq <= readSeq,
                            ).length,
                            seen: members.data.filter(
                              (member) =>
                                member.principalId !== session?.userId &&
                                member.historyFromSeq <= readSeq &&
                                member.lastReadMessageSeq >= readSeq,
                            ).length,
                            delivered: members.data.some(
                              (member) =>
                                member.principalId !== session?.userId &&
                                member.historyFromSeq <= readSeq &&
                                member.lastDeliveredMessageSeq >= readSeq,
                            ),
                          }
                        : undefined
                    }
                    blocks={readMessageBlocks(message)}
                    grouped={grouped}
                    replyPreview={
                      message.replyToId
                        ? byId.get(message.replyToId)?.content
                        : undefined
                    }
                    openMenu={(e) => {
                      e.preventDefault();
                      menuTrigger.current = e.currentTarget as HTMLElement;
                      const selection = window.getSelection();
                      const body = e.currentTarget.querySelector(
                        `.${styles.blockStack}`,
                      );
                      const quoteRoot = (node: Node) =>
                        (node instanceof Element ? node : node.parentElement)?.closest(
                          `.${styles.text}`,
                        );
                      const selected =
                        selection?.anchorNode &&
                        selection.focusNode &&
                        body?.contains(selection.anchorNode) &&
                        body.contains(selection.focusNode) &&
                        quoteRoot(selection.anchorNode) &&
                        quoteRoot(selection.anchorNode) ===
                          quoteRoot(selection.focusNode)
                          ? selection.toString().trim()
                          : "";
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
      {through !== undefined || newMessages > 0 ? (
        <button
          type="button"
          className={styles.jumpNotice}
          onClick={() => {
            if (through !== undefined) {
              setHistoryWindows((current) => ({
                ...current,
                [conversationId]: { limit: RECENT_MESSAGES },
              }));
              previous.current = null;
              positions.current.delete(conversationId);
            } else {
              virtualizer.scrollToIndex(items.length - 1, { align: "end" });
            }
            setNewMessages(0);
          }}
        >
          {through !== undefined
            ? "К последним сообщениям"
            : `Новые сообщения · ${newMessages}`}
        </button>
      ) : null}
      {menu ? (
        <MessageContextMenu
          anchor={menu.anchor}
          quote={menu.quote}
          message={menu.message}
          conversationId={conversationId}
          userId={session?.userId}
          onCreateTicket={
            myRole && myRole !== "guest"
              ? (id) => setTicketSource({ conversationId, id })
              : undefined
          }
          onClose={() => {
            setMenu(null);
            menuTrigger.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {ticketSource?.conversationId === conversationId ? (
        <TicketFromMessageDialog
          key={ticketSource.id}
          conversationId={conversationId}
          messageId={ticketSource.id}
          onClose={() => setTicketSource(null)}
        />
      ) : null}
    </>
  );
}
