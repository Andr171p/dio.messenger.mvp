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

const dioDeskBase = import.meta.env.VITE_DIODESK_API_URL;

interface AuthContextValue {
  adapter: AuthAdapter;
  session: AuthSession | null;
  /** False until restoreSession finishes — avoid flashing /login on reload */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  onSessionExpired: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => new DioDeskAuthAdapter(dioDeskBase), []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const restored = await adapter.restoreSession();
        if (!cancelled) {
          setSession(restored);
        }
      } catch {
        if (!cancelled) {
          memoryAuthStore.clear();
          setSession(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
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
    setSession(null);
  }, [adapter]);

  const onSessionExpired = useCallback(() => {
    memoryAuthStore.clear();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      adapter,
      session,
      ready,
      login,
      logout,
      onSessionExpired,
      isAuthenticated: !!session,
    }),
    [adapter, session, ready, login, logout, onSessionExpired],
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
