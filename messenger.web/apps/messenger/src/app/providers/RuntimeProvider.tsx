import {
  HttpClient,
  memoryAuthStore,
  MediaUploadManager,
  createSyncEngine,
  openMessengerDatabase,
  saveDraftUpload,
  removeVoiceRecording,
  queueUploadedVoiceMessage,
  resumePendingVoiceUploads,
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
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "../../stores/uiStore.js";
import { useLiveQuery } from "dexie-react-hooks";
import { reportFailure, reportTiming } from "../telemetry.js";

import { getRuntimeConfig } from "../runtimeConfig.js";

interface RuntimeContextValue {
  db: MessengerDatabase | null;
  sync: SyncEngine | null;
  syncStatus: SyncStatus;
  http: HttpClient | null;
  desk: HttpClient | null;
  media: MediaUploadManager | null;
  accountKey: string | null;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

const idleStatus: SyncStatus = { runtime: "idle", wsConnected: false };

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const { session, adapter, isAuthenticated } = useAuth();
  const queries = useQueryClient();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(idleStatus);
  const [runtime, setRuntime] = useState<{
    db: MessengerDatabase | null;
    sync: SyncEngine | null;
    http: HttpClient | null;
    desk: HttpClient | null;
    media: MediaUploadManager | null;
    accountKey: string | null;
  }>({
    db: null,
    sync: null,
    http: null,
    desk: null,
    media: null,
    accountKey: null,
  });
  const activeAccountRef = useRef<string | null>(null);
  const selected = useUiStore((state) => state.selectedConversationId);
  const selectedExists = useLiveQuery(async () => {
    if (!selected || !runtime.db) return null;
    return { selected, exists: !!(await runtime.db.conversations.get(selected)) };
  }, [selected, runtime.db]);
  useEffect(() => {
    if (
      selectedExists &&
      selectedExists.selected === selected &&
      !selectedExists.exists
    ) {
      useUiStore.getState().setSelectedConversation(null);
      queries.clear();
    }
  }, [selectedExists, selected, queries]);

  useEffect(() => {
    if (!isAuthenticated || !session) {
      const ui = useUiStore.getState();
      ui.setSelectedConversation(null);
      ui.setSearchPanelOpen(false);
      ui.setNewChatOpen(false);
      const prev = activeAccountRef.current;
      activeAccountRef.current = null;
      setRuntime({
        db: null,
        sync: null,
        http: null,
        desk: null,
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
    const { messengerApi } = getRuntimeConfig();
    activeAccountRef.current = accountKey;
    const ui = useUiStore.getState();
    ui.setSelectedConversation(null);
    ui.setSearchPanelOpen(false);
    ui.setNewChatOpen(false);
    const lifetime = new AbortController();
    const sessionToken = () => {
      memoryAuthStore.syncFromStorage();
      if (adapter.getSession() !== session) {
        lifetime.abort();
        return null;
      }
      return adapter.getAccessToken();
    };
    const db = openMessengerDatabase(accountKey);
    const client = (baseUrl: string) =>
      new HttpClient({
        baseUrl,
        signal: lifetime.signal,
        timeoutMs: 12_000,
        getAccessToken: sessionToken,
        refreshAccessToken: async (rejectedToken) => {
          const active = sessionToken();
          if (adapter.getSession() !== session) return null;
          if (active && active !== rejectedToken) return active;
          try {
            await adapter.refresh(rejectedToken);
            return sessionToken();
          } catch {
            if (!lifetime.signal.aborted && navigator.onLine)
              reportFailure("session_refresh_failed");
            return null;
          }
        },
      });
    const http = client(messengerApi);
    const desk = client(getRuntimeConfig().deskApi);
    const wsBase = new URL(`${messengerApi}/v1/ws`, window.location.origin);
    wsBase.protocol = wsBase.protocol === "https:" ? "wss:" : "ws:";
    const sync = createSyncEngine({
      db,
      accountKey,
      userId: session.userId,
      onFailure: reportFailure,
      onTiming: reportTiming,
      onAccessRevoked: (conversationId) => {
        const ui = useUiStore.getState();
        if (ui.selectedConversationId === conversationId)
          ui.setSelectedConversation(null);
        ui.setSearchPanelOpen(false);
        queries.clear();
      },
      http,
      wsBaseUrl: wsBase.href,
    });
    const media = new MediaUploadManager(
      http,
      async (job) => {
        if (!job.assetId) return;
        if (job.sendAsMessage && job.voiceUploadId) {
          await queueUploadedVoiceMessage(
            db,
            accountKey,
            job.voiceUploadId,
            job.assetId,
            session.userId,
          );
          sync.requestFlush();
          return;
        }
        await saveDraftUpload(
          db,
          accountKey,
          job.conversationId,
          job.assetId,
          job.file.name,
          job.presentation,
          job.threadId,
        );
        if (job.voiceUploadId) {
          await removeVoiceRecording(db, accountKey, job.voiceUploadId);
        }
      },
      lifetime.signal,
    );

    setRuntime({ db, sync, http, desk, media, accountKey });

    const resumeVoice = () => {
      void resumePendingVoiceUploads(db, accountKey, media).catch(() => undefined);
    };
    resumeVoice();

    const unsub = sync.subscribe(setSyncStatus);
    const reconcile = () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      void sync
        .synchronize()
        .then(() => sync.requestFlush())
        .catch(() => undefined);
    };
    const recovery = window.setInterval(() => {
      if (sync.getStatus().runtime === "error") reconcile();
    }, 15000);
    window.addEventListener("online", reconcile);
    window.addEventListener("online", resumeVoice);
    window.addEventListener("offline", sync.pauseSending);
    window.addEventListener("focus", reconcile);
    window.addEventListener("pageshow", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    void sync.start().catch((error) => {
      setSyncStatus((prev) => ({
        ...prev,
        runtime: "error",
        lastError: error instanceof Error ? error.message : "Sync start failed",
      }));
    });

    return () => {
      window.clearInterval(recovery);
      unsub();
      lifetime.abort();
      window.removeEventListener("online", reconcile);
      window.removeEventListener("online", resumeVoice);
      window.removeEventListener("offline", sync.pauseSending);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("pageshow", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      void sync.stop();
      if (adapter.getSession()?.accountKey !== accountKey)
        void closeMessengerDatabase(accountKey);
    };
  }, [isAuthenticated, session, adapter, queries]);

  const value: RuntimeContextValue = {
    db: runtime.db,
    sync: runtime.sync,
    syncStatus,
    http: runtime.http,
    desk: runtime.desk,
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
