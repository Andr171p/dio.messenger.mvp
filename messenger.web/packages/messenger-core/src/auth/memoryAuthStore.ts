import type { AuthSession, AuthTokens } from "../models/types.js";

/**
 * In-memory auth with localStorage persistence so a reload keeps the session.
 *
 * Same practical model as DioDesk web (IAM tokens in localStorage). HttpOnly
 * cookie/BFF is preferred long-term; until then persistence is required for SPA.
 */
export interface MemoryAuthState {
  session: AuthSession | null;
  tokens: AuthTokens | null;
}

const STORAGE_KEY = "dio-messenger:auth";

const state: MemoryAuthState = {
  session: null,
  tokens: null,
};
const listeners = new Set<() => void>();
let storedValue: string | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function persist(): void {
  if (!canUseStorage()) return;
  const value = state.session && state.tokens ? JSON.stringify(state) : null;
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
    storedValue = value;
  } catch {
    // The session can continue in memory if browser storage is unavailable.
  }
}

function hydrateFromStorage(): void {
  if (!canUseStorage()) return;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  try {
    if (raw === storedValue) return;
    storedValue = raw;
    const parsed = (raw ? JSON.parse(raw) : {}) as {
      session?: AuthSession;
      tokens?: AuthTokens;
    };
    if (
      parsed.session?.userId &&
      parsed.session?.accountKey &&
      parsed.session.accountKey !== "pending" &&
      parsed.tokens?.accessToken &&
      parsed.tokens?.refreshToken &&
      typeof parsed.tokens.expiresAt === "number"
    ) {
      if (state.session?.accountKey !== parsed.session.accountKey) {
        state.session = parsed.session;
      }
      state.tokens = parsed.tokens;
    } else {
      state.session = null;
      state.tokens = null;
    }
  } catch {
    state.session = null;
    state.tokens = null;
  }
  notify();
}

hydrateFromStorage();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) hydrateFromStorage();
  });
}

export const memoryAuthStore = {
  syncFromStorage: hydrateFromStorage,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSession(): AuthSession | null {
    return state.session;
  },
  getTokens(): AuthTokens | null {
    return state.tokens;
  },
  getAccessToken(): string | null {
    const tokens = state.tokens;
    if (!tokens) return null;
    if (Date.now() >= tokens.expiresAt) return null;
    return tokens.accessToken;
  },
  /** Access token even if expired — for refresh flows that still need the header. */
  getAccessTokenAllowExpired(): string | null {
    return state.tokens?.accessToken ?? null;
  },
  hasRefreshToken(): boolean {
    return !!state.tokens?.refreshToken;
  },
  setAuth(session: AuthSession, tokens: AuthTokens): void {
    state.session = session;
    state.tokens = tokens;
    persist();
    notify();
  },
  clear(): void {
    state.session = null;
    state.tokens = null;
    persist();
    notify();
  },
};
