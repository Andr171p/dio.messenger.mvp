import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./OfflineIndicator.module.css";

export function GuestConversationNotice() {
  const id = useUiStore((state) => state.selectedConversationId);
  const { db, accountKey } = useRuntime();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const conversation = useLiveQuery(
    async () => (id && db ? await db.conversations.get(id) : undefined),
    [id, db],
  );
  const key = `dio-guest-notice:${accountKey}:${id}`;
  if (
    !id ||
    !accountKey ||
    !conversation?.hasExternalMembers ||
    dismissed === key ||
    localStorage.getItem(key)
  )
    return null;

  return (
    <div className={styles.banner} role="status">
      <span>
        В беседе есть внешние участники. Они видят сообщения, отправленные в этот чат.
      </span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(key, "seen");
          setDismissed(key);
        }}
      >
        Понятно
      </button>
    </div>
  );
}
