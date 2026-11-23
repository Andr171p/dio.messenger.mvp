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
  useMemo,
  useState,
  type ReactNode,
} from "react";

const dioDeskBase = import.meta.env.VITE_DIODESK_API_URL;

interface AuthContextValue {
  adapter: AuthAdapter;
  session: AuthSession | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => new DioDeskAuthAdapter(dioDeskBase), []);
  const [session, setSession] = useState<AuthSession | null>(
    memoryAuthStore.getSession(),
  );

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

  const value = useMemo<AuthContextValue>(
    () => ({
      adapter,
      session,
      login,
      logout,
      isAuthenticated: !!session,
    }),
    [adapter, session, login, logout],
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