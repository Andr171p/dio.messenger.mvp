import { Button, Icon, Spinner } from "@dio/messenger-ui";
import { useEffect, useState } from "react";
import { useMessageSearch } from "../features/search/useMessageSearch.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./GlobalSearchPanel.module.css";

export function GlobalSearchPanel() {
  const open = useUiStore((s) => s.searchPanelOpen);
  const setOpen = useUiStore((s) => s.setSearchPanelOpen);
  const setSelected = useUiStore((s) => s.setSelectedConversation);
  const [query, setQuery] = useState("");
  const search = useMessageSearch(query);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={() => setOpen(false)}>
      <div
        className={[styles.panel, "dio-glass"].join(" ")}
        role="dialog"
        aria-label="Поиск сообщений"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <Icon name="search" size={18} />
          <input
            className={styles.input}
            placeholder="Поиск по сообщениям…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            aria-label="Запрос поиска"
          />
          <kbd className={styles.kbd}>Esc</kbd>
          <Button variant="ghost" size="sm" aria-label="Закрыть" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </Button>
        </div>
        {search.isFetching ? <Spinner size="sm" /> : null}
        <ul className={styles.results}>
          {(search.data?.items ?? []).map((hit) => (
            <li key={hit.messageId}>
              <button
                type="button"
                className={styles.hit}
                onClick={() => {
                  setSelected(hit.conversationId);
                  setOpen(false);
                }}
              >
                <span className={styles.snippet}>{hit.snippet}</span>
                <span className={styles.meta}>{hit.conversationId}</span>
              </button>
            </li>
          ))}
        </ul>
        {!search.isFetching && query.trim().length >= 2 && !(search.data?.items.length) ? (
          <p className={styles.empty}>Ничего не найдено</p>
        ) : null}
      </div>
    </div>
  );
}