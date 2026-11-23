import { Avatar, Badge, Button, Icon, Input } from "@dio/messenger-ui";
import type { Conversation } from "@dio/messenger-core";
import { useLiveQuery } from "dexie-react-hooks";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore, type ListCategory } from "../stores/uiStore.js";
import styles from "./ConversationList.module.css";

const CHIPS: { id: ListCategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "direct", label: "Личные" },
  { id: "group", label: "Группы" },
];

function formatTime(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function ConversationList() {
  const { db, accountKey, sync } = useRuntime();
  const search = useUiStore((s) => s.listSearch);
  const setSearch = useUiStore((s) => s.setListSearch);
  const category = useUiStore((s) => s.listCategory);
  const setCategory = useUiStore((s) => s.setListCategory);
  const selectedId = useUiStore((s) => s.selectedConversationId);
  const setSelected = useUiStore((s) => s.setSelectedConversation);
  const setSearchOpen = useUiStore((s) => s.setSearchPanelOpen);
  const setNewChatOpen = useUiStore((s) => s.setNewChatOpen);

  const conversations = useLiveQuery(async () => {
    if (!db || !accountKey) return [] as Conversation[];
    const rows = await db.conversations.where("accountKey").equals(accountKey).toArray();
    return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [db, accountKey]);

  const visible =
    conversations?.filter((c) => {
      if (category === "direct" && c.kind !== "direct") return false;
      if (category === "group" && c.kind !== "group") return false;
      if (!search.trim()) return true;
      return c.title.toLowerCase().includes(search.toLowerCase());
    }) ?? [];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>DIO Chat</h2>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Новый чат"
            onClick={() => setNewChatOpen(true)}
          >
            <Icon name="pencil" size={18} />
          </Button>
        </div>
        <div className={styles.searchWrap}>
          <Icon name="search" size={16} className={styles.searchIcon} />
          <Input
            placeholder="Поиск"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск бесед"
            className={styles.searchField}
          />
          <button
            type="button"
            className={styles.kbdHint}
            onClick={() => setSearchOpen(true)}
          >
            Ctrl K
          </button>
        </div>
        <div className={styles.chips} role="tablist" aria-label="Фильтр бесед">
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={category === chip.id}
              className={[styles.chip, category === chip.id ? styles.chipActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setCategory(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </header>
      <ul className={styles.list}>
        {visible.map((conv) => (
          <li key={conv.id}>
            <button
              type="button"
              className={[styles.item, selectedId === conv.id ? styles.selected : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setSelected(conv.id);
                sync?.watchConversation(conv.id);
              }}
            >
              <Avatar name={conv.title} size="md" />
              <div className={styles.meta}>
                <div className={styles.row}>
                  <span className={styles.name}>{conv.title}</span>
                  <span className={styles.time}>{formatTime(conv.lastMessageAt)}</span>
                </div>
                <span className={styles.preview}>
                  {conv.lastMessagePreview ?? "Нет сообщений"}
                </span>
              </div>
              {conv.unreadCount > 0 ? (
                <Badge tone="info">{conv.unreadCount}</Badge>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}