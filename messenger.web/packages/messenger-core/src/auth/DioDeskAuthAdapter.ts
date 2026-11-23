import type { AuthSession, AuthTokens } from "../models/types.js";
import { HttpClient } from "../transport/httpClient.js";
import { memoryAuthStore } from "./memoryAuthStore.js";
import type { AuthAdapter, LoginCredentials } from "./types.js";

interface DioDeskTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
}

interface DioDeskUserInfo {
  id: string;
  email: string;
  roles: string[];
  counterparty_id?: string | null;
}

export class DioDeskAuthAdapter implements AuthAdapter {
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

  async restoreSession(): Promise<AuthSession | null> {
    const session = memoryAuthStore.getSession();
    const tokens = memoryAuthStore.getTokens();
    if (!session || !tokens) {
      return null;
    }

    if (Date.now() < tokens.expiresAt - 30_000) {
      return session;
    }

    if (!tokens.refreshToken) {
      memoryAuthStore.clear();
      return null;
    }

    try {
      await this.refresh();
      return memoryAuthStore.getSession();
    } catch {
      memoryAuthStore.clear();
      return null;
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const body = new URLSearchParams();
    body.set("username", credentials.email);
    body.set("password", credentials.password);

    const tokensRaw = await this.http.request<DioDeskTokenResponse>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const tokens: AuthTokens = {
      accessToken: tokensRaw.access_token,
      refreshToken: tokensRaw.refresh_token,
      expiresAt: tokensRaw.expires_at * 1000,
    };

    // Temporarily place access token so userinfo can authenticate.
    memoryAuthStore.setAuth(
      {
        userId: "pending",
        accountKey: "pending",
      },
      tokens,
    );

    const user = await this.http.get<DioDeskUserInfo>("/api/v1/auth/userinfo");
    const tenantId = user.counterparty_id ?? undefined;
    const accountKey = tenantId ? `${user.id}:${tenantId}` : user.id;

    const session: AuthSession = {
      userId: user.id,
      accountKey,
      displayName: user.email,
      ...(tenantId !== undefined ? { tenantId } : {}),
    };

    memoryAuthStore.setAuth(session, tokens);
    return session;
  }

  async refresh(): Promise<AuthTokens> {
    const current = memoryAuthStore.getTokens();
    if (!current?.refreshToken) {
      throw new Error("No refresh token");
    }

    const data = await this.http.post<DioDeskTokenResponse>("/api/v1/auth/refresh", {
      refresh_token: current.refreshToken,
    });

    const tokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:
        data.expires_at > 1_000_000_000_000
          ? data.expires_at
          : data.expires_at * 1000,
    };

    const session = memoryAuthStore.getSession();
    if (!session) {
      throw new Error("No session to refresh");
    }
    memoryAuthStore.setAuth(session, tokens);
    return tokens;
  }

  async logout(): Promise<void> {
    const token = memoryAuthStore.getAccessToken();
    const refresh = memoryAuthStore.getTokens()?.refreshToken;
    try {
      if (token) {
        await this.http.request("/api/v1/auth/logout", {
          method: "POST",
          json: refresh ? { refresh_token: refresh } : {},
        });
      }
    } catch {
      // best-effort logout
    } finally {
      memoryAuthStore.clear();
    }
  }
}
