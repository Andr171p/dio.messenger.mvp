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
  refreshAccessToken?: (rejectedToken: string | null) => Promise<string | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
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
    return this.options.getAccessToken
      ? this.options.getAccessToken()
      : memoryAuthStore.getAccessToken();
  }

  async request<T>(
    path: string,
    {
      timeoutMs,
      responseType,
      ...init
    }: RequestInit & {
      json?: unknown;
      timeoutMs?: number;
      responseType?: "blob";
    } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("X-Correlation-Id", this.correlationId());
    headers.set("Accept", "application/json");

    const token = this.token();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    let body: BodyInit | null | undefined = init.body;
    if (init.json !== undefined) {
      body = JSON.stringify(init.json);
    }

    const signals = [init.signal, this.options.signal].filter(
      (value): value is AbortSignal => !!value,
    );
    const timeout = timeoutMs ?? this.options.timeoutMs;
    const fetchAttempt = () =>
      fetch(`${this.options.baseUrl}${path}`, {
        ...init,
        headers,
        body,
        signal: AbortSignal.any(
          timeout ? [...signals, AbortSignal.timeout(timeout)] : signals,
        ),
      });
    let response = await fetchAttempt();
    if (
      response.status === 401 &&
      this.options.refreshAccessToken &&
      !(body instanceof ReadableStream)
    ) {
      await response.body?.cancel();
      for (const signal of signals) signal.throwIfAborted();
      const renewed = await this.options.refreshAccessToken(token);
      if (renewed) {
        headers.set("Authorization", `Bearer ${renewed}`);
        response = await fetchAttempt();
      }
    }

    if (response.status === 401) {
      this.options.onUnauthorized?.();
      for (const handler of this.unauthorizedHandlers) {
        handler();
      }
      throw new HttpError(401, "Unauthorized");
    }

    if (!response.ok) {
      let detail: unknown;
      try {
        const raw = await response.text();
        detail = raw;
        if (raw && response.headers.get("Content-Type")?.includes("json")) {
          detail = JSON.parse(raw);
        }
      } catch {
        // Preserve the status for empty, malformed, or interrupted bodies.
      }
      throw new HttpError(response.status, response.statusText, detail);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await (responseType === "blob" ? response.blob() : response.json())) as T;
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
