import type { AuthSession, AuthTokens } from "../models/types.js";
import { HttpClient, HttpError } from "../transport/httpClient.js";
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
  private refreshing: Promise<AuthTokens> | null = null;

  constructor(baseUrl: string) {
    this.http = new HttpClient({
      baseUrl,
      getAccessToken: () => null,
      timeoutMs: 10_000,
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
    memoryAuthStore.syncFromStorage();
    const session = memoryAuthStore.getSession();
    const tokens = memoryAuthStore.getTokens();
    if (!session || !tokens) {
      return null;
    }

    if (Date.now() < tokens.expiresAt - 30_000) {
      return session;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return session;

    if (!tokens.refreshToken) {
      memoryAuthStore.clear();
      return null;
    }

    try {
      await this.refresh();
      return memoryAuthStore.getSession();
    } catch {
      return memoryAuthStore.getSession();
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
      expiresAt: normalizeExpiry(tokensRaw.expires_at),
    };

    const user = await this.http.request<DioDeskUserInfo>("/api/v1/auth/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
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

  refresh(): Promise<AuthTokens> {
    if (this.refreshing) return this.refreshing;
    memoryAuthStore.syncFromStorage();
    const session = memoryAuthStore.getSession();
    const current = memoryAuthStore.getTokens();
    if (!session || !current?.refreshToken)
      return Promise.reject(new Error("No refresh token"));

    const run = async () => {
      memoryAuthStore.syncFromStorage();
      const active = memoryAuthStore.getTokens();
      if (!active || memoryAuthStore.getSession() !== session)
        throw new Error("Session changed");
      if (active.accessToken !== current.accessToken) return active;
      try {
        const data = await this.http.post<DioDeskTokenResponse>(
          "/api/v1/auth/refresh",
          {
            refresh_token: active.refreshToken,
          },
        );
        memoryAuthStore.syncFromStorage();
        if (memoryAuthStore.getSession() !== session)
          throw new Error("Session changed");
        const latest = memoryAuthStore.getTokens();
        if (latest && latest !== active) return latest;
        const tokens = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: normalizeExpiry(data.expires_at),
        };
        memoryAuthStore.setAuth(session, tokens);
        return tokens;
      } catch (error) {
        memoryAuthStore.syncFromStorage();
        if (memoryAuthStore.getSession() === session) {
          const latest = memoryAuthStore.getTokens();
          if (latest && latest !== active) return latest;
          if (error instanceof HttpError && [400, 401, 403].includes(error.status))
            memoryAuthStore.clear();
        }
        throw error;
      }
    };
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    const pending = Promise.resolve(
      locks ? locks.request("dio-messenger-auth-refresh", run) : run(),
    ).finally(() => {
      this.refreshing = null;
    });
    this.refreshing = pending;
    return pending;
  }

  async logout(): Promise<void> {
    const token = memoryAuthStore.getAccessTokenAllowExpired();
    const refresh = memoryAuthStore.getTokens()?.refreshToken;
    memoryAuthStore.clear();
    try {
      if (token) {
        await this.http.request("/api/v1/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          json: refresh ? { refresh_token: refresh } : {},
        });
      }
    } catch {
      // best-effort logout
    }
  }
}

function normalizeExpiry(timestamp: number) {
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
}
