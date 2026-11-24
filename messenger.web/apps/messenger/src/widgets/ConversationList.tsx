import { Avatar, Badge, Button, Icon } from "@dio/messenger-ui";
import type { Conversation } from "@dio/messenger-core";
import { useLiveQuery } from "dexie-react-hooks";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore, type ListCategory } from "../stores/uiStore.js";
import styles from "./ConversationList.module.css";
import { useAuth } from "../app/providers/AuthProvider.js";

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
  const { db, accountKey, sync, syncStatus } = useRuntime();
  const { logout } = useAuth();
  const category = useUiStore((s) => s.listCategory);
  const setCategory = useUiStore((s) => s.setListCategory);
  const selectedId = useUiStore((s) => s.selectedConversationId);
  const setSelected = useUiStore((s) => s.setSelectedConversation);
  const setSearchOpen = useUiStore((s) => s.setSearchPanelOpen);
  const setNewChatOpen = useUiStore((s) => s.setNewChatOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const theme = useUiStore((s) => s.theme);

  const conversations = useLiveQuery(async () => {
    if (!db || !accountKey) return [] as Conversation[];
    try {
      const rows = await db.conversations
        .where("accountKey")
        .equals(accountKey)
        .toArray();
      return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    } catch {
      return [] as Conversation[];
    }
  }, [db, accountKey, syncStatus.lastSyncAt, syncStatus.runtime]);

  const visible =
    conversations?.filter((c) => {
      if (category === "direct" && c.kind !== "direct") return false;
      if (category === "group" && c.kind !== "group") return false;
      return true;
    }) ?? [];

  const loading =
    conversations === undefined ||
    syncStatus.runtime === "starting" ||
    syncStatus.runtime === "syncing";

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>DIO Chat</h2>
          <div className={styles.actions}>
            <Button
              className={styles.mobileTheme}
              variant="ghost"
              size="sm"
              aria-label="Сменить тему"
              onClick={toggleTheme}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            </Button>
            <Button
              className={styles.mobileTheme}
              variant="ghost"
              size="sm"
              aria-label="Выйти из аккаунта"
              onClick={() => void logout()}
            >
              <Icon name="logout" size={18} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Новый чат"
              onClick={() => setNewChatOpen(true)}
            >
              <Icon name="pencil" size={18} />
            </Button>
          </div>
        </div>
        <button
          type="button"
          className={styles.searchWrap}
          onClick={() => setSearchOpen(true)}
          aria-label="Поиск чатов и сообщений"
        >
          <Icon name="search" size={16} />
          <span>Поиск</span>
          <kbd className={styles.kbdHint}>Ctrl K</kbd>
        </button>
        <div className={styles.chips} role="group" aria-label="Фильтр бесед">
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={category === chip.id}
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
      <ul className={[styles.list, "dio-scroll"].join(" ")}>
        {visible.map((conv) => (
          <li key={conv.id}>
            <button
              type="button"
              aria-current={selectedId === conv.id || undefined}
              className={[
                styles.item,
                selectedId === conv.id ? styles.selected : "",
                conv.unreadCount > 0 ? styles.unread : "",
              ]
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
      {visible.length === 0 ? (
        <p className={styles.empty}>
          {loading
            ? "Загрузка бесед…"
            : syncStatus.runtime === "error"
              ? "Не удалось загрузить беседы. Проверьте соединение и обновите страницу."
              : "Пока нет бесед — создайте новый чат."}
        </p>
      ) : null}
    </div>
  );
}
