import type { Conversation } from "@dio/messenger-core";
import { Avatar, Badge, Button, Icon } from "@dio/messenger-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./ChatHeader.module.css";

function kindLabel(kind?: Conversation["kind"]): string {
  if (kind === "group") return "Группа";
  if (kind === "direct") return "Личный";
  return "Чат";
}

export function ChatHeader() {
  const { db, sync } = useRuntime();
  const { session } = useAuth();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const mobilePane = useUiStore((s) => s.mobilePane);
  const setMobilePane = useUiStore((s) => s.setMobilePane);
  const setSearchOpen = useUiStore((s) => s.setSearchPanelOpen);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!sync) return;
    return sync.subscribePresence(() => bump((n) => n + 1));
  }, [sync]);

  const conversation = useLiveQuery(async () => {
    if (!db || !conversationId) return null;
    return db.conversations.get(conversationId);
  }, [db, conversationId]);

  const typing =
    conversationId && sync ? sync.getTyping(conversationId)?.userIds ?? [] : [];
  const typingOthers = typing.filter((id) => id !== session?.userId);

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
        {mobilePane === "chat" ? (
          <Button
            variant="ghost"
            size="sm"
            className={styles.backBtn}
            aria-label="Назад к списку"
            onClick={() => setMobilePane("list")}
          >
            <Icon name="menu" />
          </Button>
        ) : null}
        <Avatar name={conversation?.title ?? "Chat"} size="md" />
        <div>
          <h1 className={styles.title}>{conversation?.title ?? "Беседа"}</h1>
          <p className={styles.subtitle}>
            {typingOthers.length ? (
              <span className={styles.typing}>печатает…</span>
            ) : (
              <>
                {participants} · {kindLabel(conversation?.kind)}
              </>
            )}
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