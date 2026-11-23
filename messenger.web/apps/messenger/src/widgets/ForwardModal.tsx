import { sendMessage, type Conversation } from "@dio/messenger-core";
import { Button, Input, Spinner } from "@dio/messenger-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./ForwardModal.module.css";

export function ForwardModal() {
  const forward = useUiStore((s) => s.forwardTarget);
  const setForward = useUiStore((s) => s.setForwardTarget);
  const { db, accountKey, sync } = useRuntime();
  const { session } = useAuth();
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversations = useLiveQuery(async () => {
    if (!db || !accountKey) return [] as Conversation[];
    const rows = await db.conversations.where("accountKey").equals(accountKey).toArray();
    return rows.sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt));
  }, [db, accountKey]);

  const items = useMemo(() => {
    const list = conversations ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list.filter((c) => c.id !== forward?.conversationId);
    return list.filter(
      (c) =>
        c.id !== forward?.conversationId &&
        c.title.toLowerCase().includes(q),
    );
  }, [conversations, filter, forward?.conversationId]);

  if (!forward) return null;

  const onForward = async (targetId: string) => {
    if (!db || !accountKey || !session || !forward.serverId) {
      setError("Сообщение ещё не синхронизировано");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await sendMessage(db, accountKey, {
        conversationId: targetId,
        content: forward.preview,
        authorId: session.userId,
        forwardedFrom: {
          conversationId: forward.conversationId,
          messageId: forward.serverId,
          text: forward.preview,
        },
      });
      sync?.requestFlush();
      setForward(null);
      setFilter("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось переслать");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => !pending && setForward(null)}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-labelledby="forward-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="forward-title">Переслать сообщение</h2>
        <p className={styles.preview}>{forward.preview}</p>
        <Input
          placeholder="Поиск чата"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Поиск чата"
        />
        {pending ? <Spinner size="sm" /> : null}
        <ul className={styles.list}>
          {items.map((conv) => (
            <li key={conv.id}>
              <button
                type="button"
                className={styles.row}
                disabled={pending}
                onClick={() => void onForward(conv.id)}
              >
                <strong>{conv.title}</strong>
                {conv.lastMessagePreview ? (
                  <span className={styles.sub}>{conv.lastMessagePreview}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {!items.length ? (
          <p className={styles.note}>Нет доступных чатов</p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button variant="ghost" disabled={pending} onClick={() => setForward(null)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}