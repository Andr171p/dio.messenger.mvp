import type { Conversation } from "@dio/messenger-core";
import { Avatar, Badge, Button, Icon } from "@dio/messenger-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./ChatHeader.module.css";

function kindLabel(kind?: Conversation["kind"]): string {
  if (kind === "group") return "Группа";
  if (kind === "direct") return "Личный";
  return "Чат";
}

export function ChatHeader() {
  const { db } = useRuntime();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const setSearchOpen = useUiStore((s) => s.setSearchPanelOpen);

  const conversation = useLiveQuery(async () => {
    if (!db || !conversationId) return null;
    return db.conversations.get(conversationId);
  }, [db, conversationId]);

  if (!conversationId) {
    return (
      <header className={styles.root}>
        <h1 className={styles.title}>DIO Chat</h1>
      </header>
    );
  }

  const guest =
    conversation?.isGuest || conversation?.hasExternalMembers === true;
  const participants =
    conversation?.memberCount !== undefined
      ? `${conversation.memberCount} участников`
      : "Участники";

  return (
    <header className={styles.root}>
      <div className={styles.identity}>
        <Avatar name={conversation?.title ?? "Chat"} size="md" />
        <div>
          <h1 className={styles.title}>{conversation?.title ?? "Беседа"}</h1>
          <p className={styles.subtitle}>
            {participants} · {kindLabel(conversation?.kind)}
          </p>
          {guest ? (
            <Badge tone="warning">Гостевой доступ — внешние участники</Badge>
          ) : null}
        </div>
      </div>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Поиск в беседе"
          onClick={() => setSearchOpen(true)}
        >
          <Icon name="search" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Ещё">
          <Icon name="more" />
        </Button>
      </div>
    </header>
  );
}