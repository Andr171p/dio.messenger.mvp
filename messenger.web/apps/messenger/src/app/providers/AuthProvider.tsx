import {
  DioDeskAuthAdapter,
  memoryAuthStore,
  type AuthAdapter,
  type AuthSession,
} from "@dio/messenger-core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getRuntimeConfig } from "../runtimeConfig.js";

interface AuthContextValue {
  adapter: AuthAdapter;
  session: AuthSession | null;
  /** False until restoreSession finishes — avoid flashing /login on reload */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => new DioDeskAuthAdapter(getRuntimeConfig().deskApi), []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = memoryAuthStore.subscribe(() =>
      setSession(memoryAuthStore.getSession()),
    );
    void (async () => {
      try {
        const restored = await adapter.restoreSession();
        if (!cancelled) {
          setSession(restored);
        }
      } catch {
        if (!cancelled) {
          setSession(memoryAuthStore.getSession());
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [adapter]);

  const login = useCallback(
    async (email: string, password: string) => {
      const next = await adapter.login({ email, password });
      setSession(next);
    },
    [adapter],
  );

  const logout = useCallback(async () => {
    await adapter.logout();
  }, [adapter]);

  const value = useMemo<AuthContextValue>(
    () => ({
      adapter,
      session,
      ready,
      login,
      logout,
      isAuthenticated: !!session,
    }),
    [adapter, session, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
