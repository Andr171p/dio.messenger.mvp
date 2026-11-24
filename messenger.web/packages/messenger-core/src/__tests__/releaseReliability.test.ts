import { afterEach, expect, it, vi } from "vitest";
import { DioDeskAuthAdapter } from "../auth/DioDeskAuthAdapter.js";
import { memoryAuthStore } from "../auth/memoryAuthStore.js";
import { HttpClient } from "../transport/httpClient.js";
import { MessengerDatabase } from "../storage/database.js";
import { sendMessage } from "../commands/sendMessage.js";
import { OutboxProcessor } from "../outbox/outboxProcessor.js";

afterEach(() => {
  memoryAuthStore.clear();
  vi.unstubAllGlobals();
});

it("preserves the HTTP status for an empty or malformed error response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("", {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  const client = new HttpClient({ baseUrl: "https://api.example.invalid" });
  await expect(client.get("/restricted")).rejects.toMatchObject({
    name: "HttpError",
    status: 403,
  });
});

it("shares a single refresh and replays requests rejected with 401", async () => {
  memoryAuthStore.setAuth(
    { accountKey: "test", userId: "test" },
    {
      accessToken: "old",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
    },
  );
  const adapter = new DioDeskAuthAdapter("https://iam.example.invalid");
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/refresh")) {
      return Response.json({
        access_token: "new",
        refresh_token: "renewed",
        expires_at: Date.now() + 60_000,
      });
    }
    return new Headers(init.headers).get("Authorization") === "Bearer new"
      ? Response.json({ ok: true })
      : new Response(null, { status: 401 });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new HttpClient({
    baseUrl: "https://api.example.invalid",
    getAccessToken: () => adapter.getAccessToken(),
    refreshAccessToken: async (rejected) => {
      const current = adapter.getAccessToken();
      return current && current !== rejected
        ? current
        : (await adapter.refresh()).accessToken;
    },
  });
  await expect(Promise.all([client.get("/one"), client.get("/two")])).resolves.toEqual([
    { ok: true },
    { ok: true },
  ]);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/refresh"))).toHaveLength(1);
});

it("claims a queued message once across two database connections without Web Locks", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const accountKey = crypto.randomUUID();
  const first = new MessengerDatabase(accountKey);
  const second = new MessengerDatabase(accountKey);
  try {
    const clientMessageId = await sendMessage(first, accountKey, {
      conversationId: "chat",
      authorId: accountKey,
      content: "Queued message",
    });
    const fetch = vi.fn(async () =>
      Response.json({
        id: crypto.randomUUID(),
        clientMessageId,
        createdSeq: 2,
        eventSeq: 2,
        revision: 1,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const http = new HttpClient({ baseUrl: "https://api.example.invalid" });
    await Promise.all([
      new OutboxProcessor({ db: first, accountKey, http }).flush(),
      new OutboxProcessor({ db: second, accountKey, http }).flush(),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await first.outbox.count()).toBe(0);
    expect((await second.messages.get(clientMessageId))?.sendStatus).toBe("sent");
  } finally {
    second.close();
    await first.delete();
  }
});
