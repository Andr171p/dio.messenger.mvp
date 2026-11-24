import { Icon } from "@dio/messenger-ui";
import { useSyncExternalStore } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import styles from "./OfflineIndicator.module.css";

function subscribeOnline(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

/**
 * Connectivity banner only — never a permanent “В сети” status bar.
 * User presence belongs in ChatHeader.
 */
export function OfflineIndicator() {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, () => true);
  const { syncStatus, sync } = useRuntime();

  if (!online) {
    return (
      <div className={[styles.banner, styles.error].join(" ")} role="status">
        <Icon name="offline" size={16} />
        <span>Нет подключения. Сообщения будут отправлены позже.</span>
      </div>
    );
  }

  if (
    syncStatus.runtime === "starting" ||
    (syncStatus.runtime === "syncing" && syncStatus.lastSyncAt === undefined)
  ) {
    return (
      <div className={[styles.banner, styles.info].join(" ")} role="status">
        <Icon name="offline" size={16} />
        <span>Подключение…</span>
      </div>
    );
  }

  if (syncStatus.runtime === "error") {
    return (
      <div className={[styles.banner, styles.warning].join(" ")} role="status">
        <Icon name="offline" size={16} />
        <span>Не удалось обновить данные — показан локальный кэш</span>
        <button
          type="button"
          onClick={() => {
            void sync?.synchronize().catch(() => undefined);
          }}
        >
          Повторить
        </button>
      </div>
    );
  }

  return null;
}
