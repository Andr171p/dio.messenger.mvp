import { pinMessage, type LocalMessage } from "@dio/messenger-core";
import { Icon } from "@dio/messenger-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./PinBar.module.css";

export function PinBar() {
  const { db, accountKey, sync } = useRuntime();
  const conversationId = useUiStore((s) => s.selectedConversationId);

  const pinned = useLiveQuery(async () => {
    if (!db || !accountKey || !conversationId) return [] as LocalMessage[];
    const rows = await db.messages
      .where("[accountKey+conversationId]")
      .equals([accountKey, conversationId])
      .filter((m) => !!m.isPinned && !m.deletedAt)
      .toArray();
    return rows.sort(
      (a, b) => (b.createdSeq ?? b.createdAt) - (a.createdSeq ?? a.createdAt),
    );
  }, [db, accountKey, conversationId]);

  const items = pinned ?? [];
  if (!conversationId || !items.length) return null;

  return (
    <div className={styles.root} aria-label="Закреплённые сообщения">
      {items.map((message) => (
        <div key={message.localId} className={styles.item}>
          <Icon name="bookmark" size={14} />
          <button
            type="button"
            className={styles.text}
            onClick={() =>
              useUiStore
                .getState()
                .setMessageTarget({ id: message.serverId ?? message.localId })
            }
          >
            {message.replyPreview ?? message.content.slice(0, 120)}
          </button>
          <button
            type="button"
            className={styles.unpin}
            aria-label="Открепить"
            onClick={() => {
              if (!db || !accountKey) return;
              void pinMessage(db, accountKey, {
                conversationId,
                localId: message.localId,
                pin: false,
              }).then(() => sync?.requestFlush());
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
