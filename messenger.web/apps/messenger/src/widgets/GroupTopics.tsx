import { Button, Input } from "@dio/messenger-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import { ChatDialog } from "./ChatDialog.js";
import styles from "./NewChatModal.module.css";

interface Topic {
  id: string;
  title: string | null;
}

function useTopics(conversationId: string, watch: boolean) {
  const { accountKey, http } = useRuntime();
  const key = ["topics", accountKey, conversationId];
  const endpoint = `/v1/conversations/${conversationId}/threads`;
  const topics = useQuery({
    queryKey: key,
    queryFn: () => http!.get<Topic[]>(endpoint),
    enabled: !!http,
    refetchInterval: watch ? 10000 : false,
  });
  return { topics, key, endpoint, http };
}

export function GroupTopics({ conversationId }: { conversationId: string }) {
  const active = useUiStore((s) => s.selectedThreadId);
  const show = useUiStore((s) => s.setTopicsOpen);
  const { topics } = useTopics(conversationId, false);
  const current = topics.data?.find((t) => t.id === active);
  return (
    <button className={styles.topicBar} onClick={() => show(true)}>
      <span>Темы</span>
      <strong># {active ? current?.title || "Тема" : "Общий чат"}</strong>⌄
    </button>
  );
}

export function TopicList({ conversationId }: { conversationId: string }) {
  const active = useUiStore((s) => s.selectedThreadId);
  const select = useUiStore((s) => s.setThread);
  const show = useUiStore((s) => s.setTopicsOpen);
  const { topics, key, endpoint, http } = useTopics(conversationId, true);
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    setCreating(false);
    setError("");
    setTitle("");
  };
  async function create() {
    if (!http || !title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const topic = await http.post<Topic>(endpoint, { title: title.trim() });
      client.setQueryData<Topic[]>(key, (prev) => [
        topic,
        ...(prev ?? []).filter((t) => t.id !== topic.id),
      ]);
      select(topic.id);
      close();
    } catch {
      setError("Не удалось создать тему. Проверьте подключение.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <nav className={styles.topicList} aria-label="Темы группы">
      <button className={styles.textButton} onClick={() => show(false)}>
        ← Все чаты
      </button>
      <h2>Темы группы</h2>
      <ul className={styles.topicItems}>
        {[{ id: "", title: "Общий чат" }, ...(topics.data ?? [])].map((t) => (
          <li key={t.id}>
            <button
              className={styles.userRow}
              aria-current={(active ?? "") === t.id || undefined}
              onClick={() => select(t.id || undefined)}
            >
              <span aria-hidden>#</span> {t.title || "Обсуждение сообщения"}
            </button>
          </li>
        ))}
      </ul>
      {topics.isPending && <p role="status">Загружаем темы…</p>}
      {topics.isError && <p role="status">Список тем пока недоступен.</p>}
      <Button variant="ghost" onClick={() => setCreating(true)}>
        Создать тему
      </Button>
      {creating && (
        <ChatDialog title="Новая тема" onClose={close} busy={busy}>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input
              label="Название темы"
              value={title}
              maxLength={256}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <Button type="submit" disabled={!title.trim() || busy} loading={busy}>
              Создать
            </Button>
          </form>
        </ChatDialog>
      )}
    </nav>
  );
}
