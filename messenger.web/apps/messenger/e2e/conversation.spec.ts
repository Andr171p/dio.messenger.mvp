import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const replyId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const resourceId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const otherChatId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const chat = { id: chatId, type: "GROUP", title: "Дежурная смена", lastEventSeq: 81 };
const source = {
  id: sourceId,
  conversationId: chatId,
  senderId: chatId,
  createdSeq: 1,
  content: { blocks: [{ type: "text", text: "Проверяем доступ к VPN." }] },
  createdAt: "2026-11-24T09:00:00Z",
};
const reply = {
  ...source,
  id: replyId,
  senderId: userId,
  createdSeq: 2,
  replyToId: sourceId,
  content: {
    quoteText: "доступ к VPN",
    blocks: [
      { type: "text", text: "Уже есть заявка." },
      {
        type: "resource",
        provider: "dio-desk",
        resourceType: "ticket",
        resourceId,
        number: "INC-228",
      },
    ],
  },
};

test.beforeEach(async ({ context }) => {
  await context.routeWebSocket("**/v1/ws?*", () => {});
  await context.addInitScript(
    ({ userId }) => {
      if (localStorage.getItem("dio-test-initialized")) return;
      localStorage.setItem("dio-test-initialized", "1");
      localStorage.setItem(
        "dio-messenger:auth",
        JSON.stringify({
          session: { userId, accountKey: userId },
          tokens: {
            accessToken: "fixture",
            refreshToken: "fixture",
            expiresAt: Date.now() + 600_000,
          },
        }),
      );
    },
    { userId },
  );
  await context.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/ws/tickets")) {
      return route.fulfill({ json: { ticket: "fixture", expiresIn: 60 } });
    }
    if (url.pathname.endsWith("/manifest")) {
      return route.fulfill({
        json: {
          conversations: [
            { conversationId: chatId, lastEventSeq: 81 },
            { conversationId: otherChatId, lastEventSeq: 0 },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/conversations"))
      return route.fulfill({
        json: [
          chat,
          {
            id: otherChatId,
            type: "GROUP",
            title: "Вторая группа",
            lastEventSeq: 0,
            hasExternalMembers: true,
          },
        ],
      });
    if (url.pathname.endsWith("/snapshot"))
      return route.fulfill({
        json: {
          conversation: chat,
          membership: { historyFromSeq: 1, lastReadMessageSeq: 2 },
          messages: [reply],
          snapshotEventSeq: 81,
        },
      });
    if (url.pathname.endsWith("/messages") && route.request().method() === "GET") {
      return route.fulfill({ json: [source] });
    }
    if (url.pathname.endsWith("/preview"))
      return route.fulfill({
        json: {
          ref: { resourceId },
          number: "INC-228",
          title: "Доступ к VPN",
          status: "В работе",
          access: "full",
        },
      });
    if (url.pathname.endsWith("/read-cursor")) {
      return route.fulfill({ json: { lastReadMessageSeq: 2 } });
    }
    return route.fulfill({ json: [] });
  });
});

test("сохраняет черновик и восстанавливает контекстную панель", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 840 });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const editor = page.getByRole("textbox", { name: "Текст сообщения" });
  await editor.fill("Проверим подключение");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          const database = indexedDB.open(
            "dio-messenger:" + "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          );
          database.onerror = () => resolve(false);
          database.onsuccess = () => {
            const db = database.result;
            if (!db.objectStoreNames.contains("drafts")) {
              db.close();
              resolve(false);
              return;
            }
            const count = db.transaction("drafts").objectStore("drafts").count();
            count.onsuccess = () => {
              db.close();
              resolve(count.result > 0);
            };
            count.onerror = () => {
              db.close();
              resolve(false);
            };
          };
        });
      }),
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await expect(editor).toHaveValue("Проверим подключение");
  await page.getByRole("button", { name: /Подробнее/ }).click();
  await expect(
    page.getByRole("complementary", { name: "Контекст заявки" }),
  ).toBeVisible();
  expect((await page.locator("main").boundingBox())!.width).toBe(616);
  await page.setViewportSize({ width: 760, height: 840 });
  await expect(page.getByRole("dialog", { name: "Контекст заявки" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Подробнее/ })).toBeFocused();
});

test("переходит от цитаты к сообщению вне локального снимка", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const original = page.waitForRequest(
    (request) =>
      new URL(request.url()).searchParams.get("aroundMessageId") === sourceId,
  );
  await page.getByRole("button", { name: "«доступ к VPN»" }).click();
  await original;
  await expect(
    page.getByText("Проверяем доступ к VPN.", { exact: true }),
  ).toBeVisible();
});

test("поиск в шапке ограничен открытой беседой", async ({ page }) => {
  await page.route("**/v1/search/messages?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: sourceId,
            conversationId: chatId,
            createdSeq: 1,
            createdAt: source.createdAt,
            snippet: "Проверяем доступ к VPN.",
          },
        ],
        limit: 20,
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await page.getByRole("button", { name: "Поиск в беседе" }).click();
  const search = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/v1/search/messages"),
  );
  await page.getByRole("textbox", { name: "Запрос поиска" }).fill("VPN");
  expect(new URL((await search).url()).searchParams.get("conversationId")).toBe(chatId);
  await page.getByRole("button", { name: /Проверяем доступ к VPN/ }).click();
  await expect(
    page.locator("main").getByText("Проверяем доступ к VPN.", { exact: true }),
  ).toBeVisible();
});

test("отправляет выделенный фрагмент как метаданные ответа", async ({ page }) => {
  await page.route(`**/v1/conversations/${chatId}/messages*`, async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: {
        id: crypto.randomUUID(),
        clientMessageId: body.clientMessageId,
        createdSeq: 3,
        eventSeq: 82,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await page.getByRole("button", { name: "«доступ к VPN»" }).click();
  const original = page.getByText("Проверяем доступ к VPN.", { exact: true });
  await original.evaluate((node) => {
    const range = document.createRange();
    range.setStart(node.firstChild!, 10);
    range.setEnd(node.firstChild!, 22);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await original.dispatchEvent("contextmenu", { bubbles: true });
  await page.getByRole("menuitem", { name: "Цитировать фрагмент" }).click();
  await page.getByRole("textbox", { name: "Текст сообщения" }).fill("Подтверждаю");
  const sent = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/messages"),
  );
  await page.getByRole("button", { name: "Отправить" }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    replyToId: sourceId,
    quoteText: "доступ к VPN",
    blocks: [{ type: "text", text: "Подтверждаю" }],
  });
});

test("завершает загрузку в черновик исходной беседы", async ({ page }) => {
  const assetId = "12345678-3456-4000-8000-123456789012";
  let finishUpload!: () => void;
  const waitForSwitch = new Promise<void>((resolve) => {
    finishUpload = resolve;
  });
  await page.route("**/v1/media/uploads", (route) =>
    route.fulfill({
      json: {
        uploadId: assetId,
        asset: { id: assetId },
        uploadUrl: new URL("/test-upload", page.url()).href,
      },
    }),
  );
  await page.route("**/test-upload", (route) => route.fulfill({ status: 200 }));
  await page.route(`**/v1/media/uploads/${assetId}/complete`, async (route) => {
    await waitForSwitch;
    await route.fulfill({ json: { id: assetId, status: "ready" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const complete = page.waitForRequest((request) =>
    request.url().endsWith("/complete"),
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "vpn.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("test fixture"),
  });
  await complete;
  await page.getByRole("button", { name: /Вторая группа/ }).click();
  finishUpload();
  await expect
    .poll(() =>
      page.evaluate(
        ({ userId, chatId, assetId }) => {
          return new Promise<boolean>((resolve) => {
            const request = indexedDB.open(`dio-messenger:${userId}`);
            request.onerror = () => resolve(false);
            request.onsuccess = () => {
              const db = request.result;
              const draft = db
                .transaction("drafts")
                .objectStore("drafts")
                .get(`${userId}::${chatId}`);
              draft.onsuccess = () => {
                db.close();
                resolve(
                  draft.result?.attachments?.some(
                    (item: { block: { assetId: string } }) =>
                      item.block.assetId === assetId,
                  ) === true,
                );
              };
            };
          });
        },
        { userId, chatId, assetId },
      ),
    )
    .toBe(true);
  await expect(page.getByRole("button", { name: "Убрать vpn.txt" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await expect(page.getByRole("button", { name: "Убрать vpn.txt" })).toBeVisible();
});

test("запрашивает подтверждение пересылки внешней аудитории", async ({ page }) => {
  let sends = 0;
  await page.route(`**/v1/conversations/${otherChatId}/policy`, (route) =>
    route.fulfill({
      json: { allowForwarding: true },
    }),
  );
  await page.route(`**/v1/conversations/${otherChatId}/messages`, (route) => {
    sends += 1;
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: {
        id: crypto.randomUUID(),
        clientMessageId: body.clientMessageId,
        createdSeq: 1,
        eventSeq: 1,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await page
    .getByText("Уже есть заявка.", { exact: true })
    .dispatchEvent("contextmenu", { bubbles: true });
  await page.getByRole("menuitem", { name: "Переслать" }).click();
  const dialog = page.getByRole("dialog", { name: "Переслать сообщение" });
  await dialog.getByRole("button", { name: /Вторая группа/ }).click();
  await expect(dialog.getByText(/Внешние участники могут увидеть текст/)).toBeVisible();
  expect(sends).toBe(0);
  await dialog.getByRole("button", { name: "Переслать", exact: true }).click();
  await expect.poll(() => sends).toBe(1);
});

test("обновляет сессию в двух вкладках и синхронизирует выход", async ({
  context,
  page,
}) => {
  let refreshes = 0;
  let rejectOld = false;
  const recovered = new Set<import("@playwright/test").Page>();
  await context.route("**/api/v1/auth/refresh", (route) => {
    refreshes += 1;
    return route.fulfill({
      json: {
        access_token: "renewed",
        refresh_token: "renewed-refresh",
        expires_at: Date.now() + 60_000,
      },
    });
  });
  await context.route("**/api/v1/auth/logout", (route) =>
    route.fulfill({ status: 204 }),
  );
  await context.route("**/v1/sync/manifest", (route) => {
    if (rejectOld && route.request().headers().authorization !== "Bearer renewed")
      return route.fulfill({ status: 401 });
    if (rejectOld) recovered.add(route.request().frame().page());
    return route.fallback();
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Дежурная смена/ })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("button", { name: /Дежурная смена/ })).toBeVisible();
  rejectOld = true;
  await Promise.all(
    [page, other].map((tab) =>
      tab.evaluate(() => window.dispatchEvent(new Event("focus"))),
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("dio-messenger:auth") ?? "{}").tokens
            ?.accessToken,
      ),
    )
    .toBe("renewed");
  await expect.poll(() => recovered.size).toBe(2);
  expect(refreshes).toBe(1);
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(other).toHaveURL(/\/login$/);
  await expect(page).toHaveURL(/\/login$/);
});

test("отзывает доступ перед отправкой очереди после офлайна", async ({
  context,
  page,
}) => {
  let allowed = true;
  let sends = 0;
  await page.route("**/v1/sync/manifest", (route) =>
    allowed
      ? route.fallback()
      : route.fulfill({
          json: { conversations: [{ conversationId: otherChatId, lastEventSeq: 0 }] },
        }),
  );
  await page.route(`**/v1/conversations/${chatId}/messages`, (route) => {
    if (route.request().method() === "POST") sends += 1;
    return route.fallback();
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await context.setOffline(true);
  const text = "Черновик отозванной беседы";
  await page.getByRole("textbox", { name: "Текст сообщения" }).fill(text);
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("В очереди", { exact: true })).toBeVisible();
  allowed = false;
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: /Дежурная смена/ })).toHaveCount(0);
  await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  expect(sends).toBe(0);
});

test.describe("установленная PWA", () => {
  test.use({ serviceWorkers: "allow" });
  test("PWA сохраняет очередь при перезагрузке офлайн", async ({
    context,
    page,
    browserName,
  }) => {
    test.skip(
      process.env.PLAYWRIGHT_PRODUCTION !== "1" || browserName !== "chromium",
      "Нужен Chromium с production service worker и эмуляцией офлайн-режима",
    );
    let sends = 0;
    await page.route(`**/v1/conversations/${chatId}/messages`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      sends += 1;
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: {
          id: crypto.randomUUID(),
          clientMessageId: body.clientMessageId,
          createdSeq: 82,
          eventSeq: 82,
        },
      });
    });
    await page.goto("/");
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await page.getByRole("button", { name: /Дежурная смена/ }).click();
    await context.setOffline(true);
    const text = "Сообщение из офлайна";
    await page.getByRole("textbox", { name: "Текст сообщения" }).fill(text);
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("В очереди", { exact: true })).toBeVisible();
    await page.goto("/?offline-reopen");
    await page.getByRole("button", { name: /Дежурная смена/ }).click();
    await expect(page.locator("main").getByText(text, { exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect.poll(() => sends).toBe(1);
  });
});

test("владелец сохраняет правила и открывает журнал беседы", async ({ page }) => {
  let changed: boolean | undefined;
  const policy = {
    conversationId: chatId,
    allowAttachments: true,
    allowForwarding: true,
    allowExternalMembers: false,
    maxAttachmentBytes: 100_000,
    version: 1,
  };
  await page.route(`**/v1/conversations/${chatId}/members`, (route) =>
    route.fulfill({
      json: [
        {
          principalId: userId,
          role: "owner",
          historyFromSeq: 1,
          lastReadMessageSeq: 2,
        },
      ],
    }),
  );
  await page.route(`**/v1/conversations/${chatId}/policy`, (route) => {
    if (route.request().method() === "PATCH")
      changed = route.request().postDataJSON().allowAttachments;
    return route.fulfill({
      json: { ...policy, allowAttachments: changed ?? policy.allowAttachments },
    });
  });
  await page.route("**/v1/audit?*", (route) =>
    route.fulfill({
      json: [
        {
          id: "audit-event",
          actorId: userId,
          action: "conversation.policy.updated",
          createdAt: source.createdAt,
        },
      ],
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await page.getByRole("button", { name: "Настройки беседы" }).click();
  await page.getByRole("checkbox", { name: "Вложения" }).uncheck();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => changed).toBe(false);
  await page.getByText("Журнал действий", { exact: true }).click();
  await expect(
    page.getByText("Изменены настройки беседы", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Вложения запрещены правилами беседы" }),
  ).toBeDisabled();
});

test("проверяет доступ и запрашивает новую ссылку при каждом открытии файла", async ({
  context,
  page,
}) => {
  let grants = 0;
  const assetId = "12345678-3456-4000-8000-123456789012";
  await page.route(`**/v1/conversations/${chatId}/snapshot?*`, (route) =>
    route.fulfill({
      json: {
        conversation: chat,
        membership: { historyFromSeq: 1, lastReadMessageSeq: 2 },
        messages: [{ ...reply, content: { blocks: [{ type: "media", assetId }] } }],
        snapshotEventSeq: 81,
      },
    }),
  );
  await page.route(`**/v1/media/${assetId}`, (route) =>
    route.fulfill({
      json: {
        id: assetId,
        filename: "vpn.pdf",
        contentType: "application/pdf",
        size: 2_048,
        status: "ready",
      },
    }),
  );
  await page.route(`**/v1/media/${assetId}/access`, (route) => {
    grants += 1;
    return grants === 1
      ? route.fulfill({
          json: {
            url: "https://files.example.invalid/vpn.pdf",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        })
      : route.fulfill({ status: 403 });
  });
  await context.route("https://files.example.invalid/vpn.pdf", (route) =>
    route.fulfill({ status: 200, body: "fixture" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const file = page.getByRole("button", { name: /vpn.pdf/ });
  await file.click();
  await expect.poll(() => grants).toBe(1);
  await file.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Нет доступа к файлу" }),
  ).toBeVisible();
  expect(grants).toBe(2);
});
