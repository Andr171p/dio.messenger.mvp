import { Badge, Icon } from "@dio/messenger-ui";
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

export function OfflineIndicator() {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, () => true);
  const { syncStatus } = useRuntime();

  if (!online) {
    return (
      <Badge tone="error">
        <Icon name="offline" size={14} />
        Нет сети — сообщения сохраняются локально
      </Badge>
    );
  }

  if (syncStatus.runtime === "syncing" || syncStatus.runtime === "starting") {
    return (
      <Badge tone="info">
        <Icon name="offline" size={14} />
        Синхронизация…
      </Badge>
    );
  }

  if (syncStatus.runtime === "error") {
    return (
      <Badge tone="warning">
        <Icon name="offline" size={14} />
        Не удалось обновить данные — показан локальный кэш
      </Badge>
    );
  }

  if (syncStatus.wsConnected) {
    return (
      <span className={styles.ok}>
        <Icon name="check" size={14} /> В сети
      </span>
    );
  }

  return (
    <Badge tone="info">
      <Icon name="check" size={14} />
      В сети · обновления с небольшой задержкой
    </Badge>
  );
}
