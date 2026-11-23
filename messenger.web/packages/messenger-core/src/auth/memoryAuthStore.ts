import type { AuthSession, AuthTokens } from "../models/types.js";

export interface MemoryAuthState {
  session: AuthSession | null;
  tokens: AuthTokens | null;
}

const state: MemoryAuthState = {
  session: null,
  tokens: null,
};

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
  setAuth(session: AuthSession, tokens: AuthTokens): void {
    state.session = session;
    state.tokens = tokens;
  },
  clear(): void {
    state.session = null;
    state.tokens = null;
  },
};