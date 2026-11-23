import { memoryAuthStore } from "../auth/memoryAuthStore.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}

export class HttpClient {
  private readonly unauthorizedHandlers = new Set<() => void>();

  constructor(private readonly options: HttpClientOptions) {}

  onUnauthorized(handler: () => void): () => void {
    this.unauthorizedHandlers.add(handler);
    return () => this.unauthorizedHandlers.delete(handler);
  }

  private correlationId(): string {
    return crypto.randomUUID();
  }

  private token(): string | null {
    return this.options.getAccessToken?.() ?? memoryAuthStore.getAccessToken();
  }

  async request<T>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("X-Correlation-Id", this.correlationId());
    headers.set("Accept", "application/json");

    const token = this.token();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    let body: BodyInit | null | undefined = init.body;
    if (init.json !== undefined) {
      body = JSON.stringify(init.json);
    }

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers,
      body,
    });

    if (response.status === 401) {
      this.options.onUnauthorized?.();
      for (const handler of this.unauthorizedHandlers) {
        handler();
      }
      throw new HttpError(401, "Unauthorized");
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new HttpError(response.status, response.statusText, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  post<T>(path: string, json?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", json });
  }

  put<T>(path: string, json?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", json });
  }
}