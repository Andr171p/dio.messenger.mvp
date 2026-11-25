import { Button, IconButton, Input } from "@dio/messenger-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useConversationMembers } from "../features/read/useConversationMembers.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import { ChatDialog } from "./ChatDialog.js";
import styles from "./NewChatModal.module.css";

interface Topic {
  id: string;
  title: string | null;
  createdBy?: string;
}

function useTopics(conversationId: string | null, watch: boolean) {
  const { accountKey, http } = useRuntime();
  const key = ["topics", accountKey, conversationId];
  const endpoint = `/v1/conversations/${conversationId}/threads`;
  const topics = useQuery({
    queryKey: key,
    queryFn: () => http!.get<Topic[]>(endpoint),
    enabled: !!http && !!conversationId,
    refetchInterval: watch ? 10000 : false,
  });
  return { topics, key, endpoint, http };
}

export function useGroupTopics(conversationId: string | null) {
  return useTopics(conversationId, false).topics;
}

export function TopicList({ conversationId }: { conversationId: string }) {
  const { session } = useAuth();
  const members = useConversationMembers(conversationId);
  const owner = members.data?.some(
    (member) => member.principalId === session?.userId && member.role === "owner",
  );
  const active = useUiStore((s) => s.selectedThreadId);
  const select = useUiStore((s) => s.setThread);
  const showChats = useUiStore((s) => s.setSelectedConversation);
  const { topics, key, endpoint, http } = useTopics(conversationId, true);
  const client = useQueryClient();
  const [editing, setEditing] = useState<Topic>();
  const [deleting, setDeleting] = useState<Topic>();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    setCreating(false);
    setEditing(undefined);
    setDeleting(undefined);
    setError("");
    setTitle("");
  };
  useEffect(() => {
    if (active && topics.data && !topics.data.some((topic) => topic.id === active))
      select();
  }, [active, topics.data, select]);

  async function removeTopic() {
    if (!http || !deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      await http.request(`${endpoint}/${deleting.id}`, { method: "DELETE" });
      client.setQueryData<Topic[]>(key, (prev) =>
        prev?.filter((topic) => topic.id !== deleting.id),
      );
      if (active === deleting.id) select();
      close();
    } catch {
      setError("Не удалось удалить тему.");
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!http || !title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const topic = editing
        ? await http.request<Topic>(`${endpoint}/${editing.id}`, {
            method: "PATCH",
            json: { title: title.trim() },
          })
        : await http.post<Topic>(endpoint, { title: title.trim() });
      client.setQueryData<Topic[]>(key, (prev) => [
        topic,
        ...(prev ?? []).filter((t) => t.id !== topic.id),
      ]);
      if (!editing) select(topic.id);
      close();
    } catch {
      setError(
        editing
          ? "Не удалось сохранить название темы."
          : "Не удалось создать тему. Проверьте подключение.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <nav className={styles.topicList} aria-label="Темы группы">
      <button className={styles.textButton} onClick={() => showChats(null)}>
        ← Все чаты
      </button>
      <h2>Темы группы</h2>
      <ul className={styles.topicItems}>
        {[{ id: "", title: "Общий чат" }, ...(topics.data ?? [])].map((t) => (
          <li key={t.id} className={styles.memberLine}>
            <button
              className={styles.userRow}
              aria-current={(active ?? "") === t.id || undefined}
              onClick={() => select(t.id || undefined)}
            >
              <span aria-hidden>#</span> {t.title || "Обсуждение сообщения"}
            </button>
            {t.id && (owner || (t.createdBy && t.createdBy === session?.userId)) && (
              <IconButton
                label={`Переименовать тему ${t.title ?? ""}`}
                icon="edit"
                size="sm"
                onClick={() => {
                  setEditing(t);
                  setTitle(t.title ?? "");
                }}
              />
            )}
            {t.id && owner && (
              <IconButton
                label={`Удалить тему ${t.title ?? ""}`}
                icon="trash"
                size="sm"
                onClick={() => setDeleting(t)}
              />
            )}
          </li>
        ))}
      </ul>
      {topics.isPending && <p role="status">Загружаем темы…</p>}
      {topics.isError && <p role="status">Список тем пока недоступен.</p>}
      <Button variant="ghost" onClick={() => setCreating(true)}>
        Создать тему
      </Button>
      {deleting && (
        <ChatDialog title="Удалить тему" onClose={close} busy={busy}>
          <p>
            Тема «{deleting.title ?? "Обсуждение сообщения"}» исчезнет из списка
            участников группы.
          </p>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy} onClick={() => void removeTopic()}>
            Удалить
          </Button>
        </ChatDialog>
      )}
      {(creating || editing) && (
        <ChatDialog
          title={editing ? "Переименовать тему" : "Новая тема"}
          onClose={close}
          busy={busy}
        >
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
              {editing ? "Сохранить" : "Создать"}
            </Button>
          </form>
        </ChatDialog>
      )}
    </nav>
  );
}
