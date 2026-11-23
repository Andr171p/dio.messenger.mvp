import type { AuthSession, AuthTokens } from "../models/types.js";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthAdapter {
  login(credentials: LoginCredentials): Promise<AuthSession>;
  refresh(): Promise<AuthTokens>;
  logout(): Promise<void>;
  getAccessToken(): string | null;
  getSession(): AuthSession | null;
  onUnauthorized(handler: () => void): () => void;
}