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

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function persist(): void {
  if (!canUseStorage()) return;
  if (!state.session || !state.tokens) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      session: state.session,
      tokens: state.tokens,
    }),
  );
}

function hydrateFromStorage(): void {
  if (!canUseStorage()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      session?: AuthSession;
      tokens?: AuthTokens;
    };
    if (
      parsed.session?.userId &&
      parsed.session?.accountKey &&
      parsed.tokens?.accessToken &&
      parsed.tokens?.refreshToken &&
      typeof parsed.tokens.expiresAt === "number"
    ) {
      state.session = parsed.session;
      state.tokens = parsed.tokens;
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

hydrateFromStorage();

export const memoryAuthStore = {
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
  },
  clear(): void {
    state.session = null;
    state.tokens = null;
    persist();
  },
};
