import {
  HttpClient,
  MediaUploadManager,
  createSyncEngine,
  openMessengerDatabase,
  closeMessengerDatabase,
  type MessengerDatabase,
  type SyncEngine,
  type SyncStatus,
} from "@dio/messenger-core";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider.js";

const messengerApi =
  import.meta.env.VITE_MESSENGER_API_URL ?? "http://127.0.0.1:8002";

interface RuntimeContextValue {
  db: MessengerDatabase | null;
  sync: SyncEngine | null;
  syncStatus: SyncStatus;
  http: HttpClient | null;
  media: MediaUploadManager | null;
  accountKey: string | null;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

const idleStatus: SyncStatus = { runtime: "idle", wsConnected: false };

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const { session, adapter, isAuthenticated, onSessionExpired } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(idleStatus);
  const [runtime, setRuntime] = useState<{
    db: MessengerDatabase | null;
    sync: SyncEngine | null;
    http: HttpClient | null;
    media: MediaUploadManager | null;
    accountKey: string | null;
  }>({
    db: null,
    sync: null,
    http: null,
    media: null,
    accountKey: null,
  });
  const activeAccountRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !session) {
      const prev = activeAccountRef.current;
      activeAccountRef.current = null;
      setRuntime({
        db: null,
        sync: null,
        http: null,
        media: null,
        accountKey: null,
      });
      setSyncStatus(idleStatus);
      if (prev) {
        void closeMessengerDatabase(prev);
      }
      return;
    }

    const accountKey = session.accountKey;
    activeAccountRef.current = accountKey;
    const db = openMessengerDatabase(accountKey);
    const http = new HttpClient({
      baseUrl: messengerApi,
      getAccessToken: () => adapter.getAccessToken(),
      onUnauthorized: () => {
        void adapter.refresh().catch(() => {
          onSessionExpired();
        });
      },
    });
    const wsBase = messengerApi.replace(/^http/, "ws") + "/v1/ws";
    const sync = createSyncEngine({
      db,
      accountKey,
      http,
      wsBaseUrl: wsBase,
    });
    const media = new MediaUploadManager(http);

    setRuntime({ db, sync, http, media, accountKey });

    const unsub = sync.subscribe(setSyncStatus);
    void sync.start().catch((error) => {
      setSyncStatus((prev) => ({
        ...prev,
        runtime: "error",
        lastError: error instanceof Error ? error.message : "Sync start failed",
      }));
    });

    return () => {
      unsub();
      void sync.stop();
      // Keep IndexedDB open across Strict Mode remount; close only on logout.
    };
  }, [isAuthenticated, session, adapter, onSessionExpired]);

  const value: RuntimeContextValue = {
    db: runtime.db,
    sync: runtime.sync,
    syncStatus,
    http: runtime.http,
    media: runtime.media,
    accountKey: runtime.accountKey,
  };

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) {
    throw new Error("useRuntime must be used within RuntimeProvider");
  }
  return ctx;
}
