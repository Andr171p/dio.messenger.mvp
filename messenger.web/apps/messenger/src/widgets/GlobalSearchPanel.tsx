import { Button, Icon, Spinner } from "@dio/messenger-ui";
import type { Conversation } from "@dio/messenger-core";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useMessageSearch } from "../features/search/useMessageSearch.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./GlobalSearchPanel.module.css";

export function GlobalSearchPanel() {
  const scope = useUiStore((s) => s.searchConversationId);
  const setOpen = useUiStore((s) => s.setSearchPanelOpen);
  const setSelected = useUiStore((s) => s.setSelectedConversation);
  const [query, setQuery] = useState("");
  const target = useUiStore((s) => s.setMessageTarget);
  const { db, accountKey, sync } = useRuntime();
  const [debounced, setDebounced] = useState("");
  const search = useMessageSearch(debounced, scope);
  const conversations =
    useLiveQuery<Conversation[]>(
      () =>
        db && accountKey
          ? db.conversations.where("accountKey").equals(accountKey).toArray()
          : Promise.resolve([]),
      [db, accountKey],
    ) ?? [];
  const needle = query.trim().toLocaleLowerCase("ru");
  const chats =
    !scope && needle
      ? conversations.filter((chat) =>
          chat.title.toLocaleLowerCase("ru").includes(needle),
        )
      : [];

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  function openChat(id: string, message?: { id: string; seq: number }) {
    setSelected(id);
    setOpen(false);
    if (message) target(message);
    sync?.watchConversation(id);
  }

  return (
    <div
      className={styles.panel}
      role="search"
      aria-label={scope ? "Поиск в беседе" : "Поиск чатов и сообщений"}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <div className={styles.head}>
        <Icon name="search" size={18} />
        <input
          className={styles.input}
          placeholder={scope ? "Поиск в беседе…" : "Поиск чатов и сообщений…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Запрос поиска"
        />
        <kbd className={styles.kbd}>Esc</kbd>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Закрыть"
          onClick={() => setOpen(false)}
        >
          <Icon name="close" />
        </Button>
      </div>
      {!needle ? <p className={styles.empty}>Введите запрос для поиска</p> : null}
      {chats.length ? <h3>Чаты</h3> : null}
      <ul className={styles.results}>
        {chats.map((chat) => (
          <li key={chat.id}>
            <button
              type="button"
              className={styles.hit}
              onClick={() => openChat(chat.id)}
            >
              {chat.title}
            </button>
          </li>
        ))}
      </ul>
      {needle.length >= 3 && (search.isFetching || query.trim() !== debounced) ? (
        <Spinner size="sm" />
      ) : null}
      {query.trim() === debounced && search.isError ? (
        <p role="alert">
          Поиск недоступен{" "}
          <button type="button" onClick={() => void search.refetch()}>
            Повторить
          </button>
        </p>
      ) : null}
      {query.trim() === debounced && search.data?.items.length ? (
        <h3>Сообщения</h3>
      ) : null}
      <ul className={styles.results}>
        {(query.trim() === debounced ? (search.data?.items ?? []) : []).map((hit) => (
          <li key={hit.messageId}>
            <button
              type="button"
              className={styles.hit}
              onClick={() =>
                openChat(hit.conversationId, { id: hit.messageId, seq: hit.createdSeq })
              }
            >
              <span className={styles.snippet}>{hit.snippet}</span>
              <span className={styles.meta}>
                {conversations.find((chat) => chat.id === hit.conversationId)?.title ??
                  "Беседа"}
                {" · "}
                {new Date(hit.createdAt).toLocaleDateString("ru-RU")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {search.isSuccess &&
      !search.isFetching &&
      query.trim() === debounced &&
      needle.length >= 3 &&
      !chats.length &&
      !search.data.items.length ? (
        <p className={styles.empty}>Ничего не найдено</p>
      ) : null}
    </div>
  );
}
