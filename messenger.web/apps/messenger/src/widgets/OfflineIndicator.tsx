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

  if (online && syncStatus.wsConnected && syncStatus.runtime !== "error") {
    return (
      <span className={styles.ok}>
        <Icon name="check" size={14} /> На связи · local-first
      </span>
    );
  }

  return (
    <Badge tone={online ? "warning" : "error"}>
      <Icon name="offline" size={14} />
      {online
        ? "Переподключение к realtime…"
        : "Офлайн — сообщения остаются в локальной очереди"}
    </Badge>
  );
}