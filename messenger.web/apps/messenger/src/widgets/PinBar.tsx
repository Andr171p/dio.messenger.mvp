import { extractPlainText, pinMessage, type components } from "@dio/messenger-core";
import { Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useConversationMembers } from "../features/read/useConversationMembers.js";
import { useUiStore } from "../stores/uiStore.js";
import { maskSpoilers } from "./MessageFormatting.js";
import styles from "./PinBar.module.css";

export function PinBar() {
  const id = useUiStore((s) => s.selectedConversationId);
  return id ? <ConversationPins key={id} conversationId={id} /> : null;
}

function ConversationPins({ conversationId }: { conversationId: string }) {
  const { db, accountKey, sync, http } = useRuntime();
  const { session } = useAuth();
  const members = useConversationMembers(conversationId);
  const role = members.data?.find(
    (member) => member.principalId === session?.userId,
  )?.role;
  const [selected, setSelected] = useState<string>();
  const [listOpen, setListOpen] = useState(false);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listButton = useRef<HTMLButtonElement>(null);
  const path = "/v1/conversations/" + conversationId;
  const server = useQuery({
    queryKey: ["pins", conversationId],
    enabled: !!http,
    queryFn: () => http!.get<components["schemas"]["PinDTO"][]>(path + "/pins"),
    refetchInterval: 15_000,
    retry: false,
  });

  const ids = server.data?.map((pin) => pin.messageId).join(",") ?? "";
  const local = useLiveQuery(async () => {
    if (!db || !accountKey) return [];
    const known = new Set(ids.split(","));
    return db.messages
      .where("[accountKey+conversationId]")
      .equals([accountKey, conversationId])
      .filter((row) => !!row.isPinned || (!!row.serverId && known.has(row.serverId)))
      .toArray();
  }, [db, accountKey, conversationId, ids]);

  const cached = new Map(
    local?.filter((row) => row.serverId).map((row) => [row.serverId!, row]),
  );
  const remote = new Map(server.data?.map((pin) => [pin.messageId, pin]));
  const items = [
    ...(local ?? [])
      .filter(
        (row) =>
          row.serverId && row.isPinned && !row.deletedAt && !remote.has(row.serverId),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => row.serverId!),
    ...(server.data ?? [])
      .filter((pin) => {
        const row = cached.get(pin.messageId);
        return !row?.deletedAt && row?.isPinned !== false;
      })
      .sort((a, b) => Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt))
      .map((pin) => pin.messageId),
  ];
  const activeIndex = Math.max(0, items.indexOf(selected ?? ""));
  const firstSegment = Math.max(0, Math.min(activeIndex - 2, items.length - 5));
  const active = items[activeIndex];
  const preview = useQuery({
    queryKey: ["pin-preview", conversationId, active],
    enabled:
      !!http && !!active && !cached.has(active) && remote.get(active)?.preview == null,
    queryFn: async () => {
      const params = new URLSearchParams({ aroundMessageId: active!, limit: "1" });
      const rows = await http!.get<components["schemas"]["MessageDTO"][]>(
        path + "/messages?" + params,
      );
      return extractPlainText(rows.find((row) => row.id === active)?.content);
    },
    retry: false,
  });

  useEffect(() => {
    if (!listOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setListOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [listOpen]);

  if (!active) return null;

  const jump = (id: string) => useUiStore.getState().setMessageTarget({ id });
  const label = (id: string, fallback?: string | false) =>
    remote.get(id)?.preview || maskSpoilers(cached.get(id)?.content || fallback || "");
  const remove = async () => {
    if (!db || !accountKey || !sync || removing) return;
    setError(false);
    setRemoving(true);
    try {
      if (!cached.has(active))
        await sync.loadHistory(conversationId, { aroundMessageId: active });
      const row = await db.messages
        .where("serverId")
        .equals(active)
        .filter(
          (message) =>
            message.conversationId === conversationId &&
            message.accountKey === accountKey,
        )
        .first();
      if (!row) throw new Error("Закреплённое сообщение недоступно");
      await pinMessage(db, accountKey, {
        conversationId,
        localId: row.localId,
        pin: false,
      });
      sync.requestFlush();
    } catch {
      setError(true);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      ref={root}
      className={styles.root}
      aria-label="Закреплённые сообщения"
      onKeyDown={(event) => {
        if (event.key === "Escape" && listOpen) {
          event.stopPropagation();
          setListOpen(false);
          listButton.current?.focus();
        }
      }}
    >
      <button
        type="button"
        className={styles.preview}
        onClick={() => {
          jump(active);
          setSelected(items[(activeIndex + 1) % items.length]);
        }}
      >
        <span className={styles.segments} aria-hidden="true">
          {items.slice(firstSegment, firstSegment + 5).map((id) => (
            <span key={id} data-active={id === active} />
          ))}
        </span>
        <span className={styles.copy}>
          <strong>
            Закреплённое сообщение{" "}
            {items.length > 1 ? [activeIndex + 1, items.length].join(" / ") : ""}
          </strong>
          <span>{label(active, preview.data) || "Открыть сообщение"}</span>
        </span>
      </button>
      <button
        type="button"
        ref={listButton}
        className={styles.all}
        aria-expanded={listOpen}
        aria-label="Все закреплённые сообщения"
        onClick={() => setListOpen(!listOpen)}
      >
        <Icon name="pin" size={18} />
      </button>
      {listOpen ? (
        <div className={styles.list}>
          <strong>Закреплённые сообщения</strong>
          <ul>
            {items.map((id, index) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={id === active ? "true" : undefined}
                  onClick={() => {
                    setSelected(id);
                    jump(id);
                    setListOpen(false);
                    listButton.current?.focus();
                  }}
                >
                  {label(id, id === active && preview.data) ||
                    "Закреплённое сообщение " + (index + 1)}
                </button>
              </li>
            ))}
          </ul>
          {role && role !== "guest" ? (
            <button type="button" disabled={removing} onClick={() => void remove()}>
              Открепить выбранное
            </button>
          ) : null}
          {error ? <p role="alert">Не удалось открепить сообщение</p> : null}
        </div>
      ) : null}
    </div>
  );
}
