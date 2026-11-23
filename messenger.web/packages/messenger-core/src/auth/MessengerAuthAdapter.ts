import type { AuthSession, AuthTokens } from "../models/types.js";
import { HttpClient } from "../transport/httpClient.js";
import { memoryAuthStore } from "./memoryAuthStore.js";
import type { AuthAdapter, LoginCredentials } from "./types.js";

interface MessengerLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  accountKey: string;
  displayName?: string;
}

/**
 * Messenger-native auth when the client talks to messenger.back directly.
 */
export class MessengerAuthAdapter implements AuthAdapter {
  private readonly http: HttpClient;
  private unauthorized = new Set<() => void>();

  constructor(baseUrl: string) {
    this.http = new HttpClient({
      baseUrl,
      getAccessToken: () => memoryAuthStore.getAccessToken(),
      onUnauthorized: () => {
        for (const handler of this.unauthorized) {
          handler();
        }
      },
    });
  }

  onUnauthorized(handler: () => void): () => void {
    this.unauthorized.add(handler);
    return () => this.unauthorized.delete(handler);
  }

  getAccessToken(): string | null {
    return memoryAuthStore.getAccessToken();
  }

  getSession(): AuthSession | null {
    return memoryAuthStore.getSession();
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const data = await this.http.post<MessengerLoginResponse>("/v1/auth/login", {
      email: credentials.email,
      password: credentials.password,
    });

    const tokens: AuthTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
    };

    const session: AuthSession = {
      userId: data.userId,
      accountKey: data.accountKey,
      ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
    };

    memoryAuthStore.setAuth(session, tokens);
    return session;
  }

  async refresh(): Promise<AuthTokens> {
    const current = memoryAuthStore.getTokens();
    if (!current) {
      throw new Error("No refresh token in memory");
    }

    const data = await this.http.post<MessengerLoginResponse>("/v1/auth/refresh", {
      refreshToken: current.refreshToken,
    });

    const tokens: AuthTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
    };

    const session = memoryAuthStore.getSession();
    if (session) {
      memoryAuthStore.setAuth(session, tokens);
    }

    return tokens;
  }

  async logout(): Promise<void> {
    memoryAuthStore.clear();
  }
}