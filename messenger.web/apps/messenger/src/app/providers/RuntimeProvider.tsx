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
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider.js";

const messengerApi = import.meta.env.VITE_MESSENGER_API_URL;

interface RuntimeContextValue {
  db: MessengerDatabase | null;
  sync: SyncEngine | null;
  syncStatus: SyncStatus;
  http: HttpClient | null;
  media: MediaUploadManager | null;
  accountKey: string | null;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const { session, adapter, isAuthenticated } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    runtime: "idle",
    wsConnected: false,
  });

  const runtime = useMemo(() => {
    if (!session) {
      return {
        db: null,
        sync: null,
        http: null,
        media: null,
        accountKey: null,
      };
    }

    const db = openMessengerDatabase(session.accountKey);
    const http = new HttpClient({
      baseUrl: messengerApi,
      getAccessToken: () => adapter.getAccessToken(),
      onUnauthorized: () => {
        void adapter.refresh().catch(() => adapter.logout());
      },
    });

    const wsBase = messengerApi.replace(/^http/, "ws") + "/v1/ws";
    const sync = createSyncEngine({
      db,
      accountKey: session.accountKey,
      http,
      wsBaseUrl: wsBase,
    });
    const media = new MediaUploadManager(http);

    return { db, sync, http, media, accountKey: session.accountKey };
  }, [session, adapter]);

  useEffect(() => {
    if (!isAuthenticated || !runtime.sync) {
      setSyncStatus({ runtime: "idle", wsConnected: false });
      return;
    }

    const unsub = runtime.sync.subscribe(setSyncStatus);
    void runtime.sync.start().catch(() => {
      setSyncStatus((prev: SyncStatus) => ({
        ...prev,
        runtime: "error",
        lastError: "Sync start failed",
      }));
    });

    return () => {
      unsub();
      void runtime.sync?.stop();
      if (runtime.accountKey) {
        void closeMessengerDatabase(runtime.accountKey);
      }
    };
  }, [isAuthenticated, runtime]);

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