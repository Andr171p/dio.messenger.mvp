import type { AuthSession, AuthTokens } from "../models/types.js";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthAdapter {
  login(credentials: LoginCredentials): Promise<AuthSession>;
  /** Restore persisted session; refresh if access expired. Returns null if logged out. */
  restoreSession(): Promise<AuthSession | null>;
  refresh(): Promise<AuthTokens>;
  logout(): Promise<void>;
  getAccessToken(): string | null;
  getSession(): AuthSession | null;
  onUnauthorized(handler: () => void): () => void;
}