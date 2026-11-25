import { expect, test, type WebSocketRoute } from "@playwright/test";
import { fileURLToPath } from "node:url";

test.use({ serviceWorkers: "block" });

const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const replyId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const resourceId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const otherChatId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const transparentPng = fileURLToPath(
  new URL("../public/brand/dios-mark.png", import.meta.url),
);
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
      const older =
        url.searchParams.has("aroundMessageId") || url.searchParams.has("beforeSeq");
      return route.fulfill({ json: older ? [source] : [reply] });
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

test("завершает загрузку в черновик исходной беседы", async ({ page, browserName }) => {
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
  await page.route("**/test-upload", (route) => route.abort("failed"));
  await page.route("**/v1/media/uploads/" + assetId + "/content", (route) => {
    expect(route.request().method()).toBe("PUT");
    const body = route.request().postDataBuffer();
    if (body || browserName !== "webkit") expect(body?.toString()).toBe("test fixture");
    return route.fulfill({ status: 204 });
  });
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
  await page
    .getByRole("dialog", { name: "Отправить вложения" })
    .getByRole("button", { name: "Отправить" })
    .click();
  await complete;
  // Simulate navigation outside the modal while the server checks the upload.
  await page
    .getByRole("button", { name: /Вторая группа/, includeHidden: true })
    .evaluate((button: HTMLButtonElement) => button.click());
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
  await page.getByRole("button", { name: "Вложения · 1" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Убрать vpn.txt" }),
  ).toBeVisible();
});

test("просматривает фото и переносит черновик в подпись к файлу", async ({ page }) => {
  const assetId = "12345678-3456-4000-8000-123456789012";
  const filename = "dios-mark.png";
  let uploads = 0;
  await page.route("**/v1/media/uploads", (route) => {
    uploads += 1;
    return route.fulfill({
      json: {
        uploadId: assetId,
        asset: { id: assetId },
        uploadUrl: new URL("/test-image-upload", page.url()).href,
      },
    });
  });
  await page.route("**/test-image-upload", (route) => route.fulfill({ status: 204 }));
  await page.route(`**/v1/media/uploads/${assetId}/complete`, (route) =>
    route.fulfill({ json: { id: assetId, status: "ready" } }),
  );
  await page.route(`**/v1/media/${assetId}`, (route) =>
    route.fulfill({
      json: {
        id: assetId,
        filename,
        contentType: "image/png",
        size: 201914,
        status: "ready",
      },
    }),
  );
  await page.route(`**/v1/conversations/${chatId}/messages`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 201,
          json: {
            id: crypto.randomUUID(),
            clientMessageId: route.request().postDataJSON().clientMessageId,
            createdSeq: 3,
            eventSeq: 82,
          },
        })
      : route.fallback(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const editor = page.getByRole("textbox", { name: "Текст сообщения" });
  await expect(editor).toBeEnabled();
  await page.locator("input[type=file]").setInputFiles(transparentPng);
  const dialog = page.getByRole("dialog", { name: "Отправить изображение" });
  const caption = dialog.getByRole("textbox", { name: "Подпись" });
  await expect(caption).toBeFocused();
  await expect(caption).toHaveValue("");
  await expect(dialog.getByRole("img", { name: filename })).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await dialog.getByRole("button", { name: "Отмена" }).click();
  expect(uploads).toBe(0);
  await expect(editor).toBeFocused();

  await editor.fill("Логотип для документации");
  await page.locator("input[type=file]").setInputFiles(transparentPng);
  await expect(caption).toHaveValue("Логотип для документации");
  await dialog.getByRole("checkbox", { name: "Отправить как файл" }).check();
  await expect(dialog.getByText(filename, { exact: true })).toBeVisible();
  const sent = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith(`/${chatId}/messages`),
  );
  await dialog.getByRole("button", { name: "Отправить" }).click();
  expect((await sent).postDataJSON().blocks).toEqual([
    { type: "text", text: "Логотип для документации" },
    { type: "media", assetId, presentation: "file" },
  ]);
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveValue("");
  await expect(page.getByRole("button", { name: /dios-mark\.png/ })).toBeVisible();
  await expect(page.getByRole("img", { name: filename })).toHaveCount(0);
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
  let releaseRefresh!: () => void;
  const concurrentRequests = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const recovered = new Set<import("@playwright/test").Page>();
  const rejected = new Set<import("@playwright/test").Page>();
  await context.addInitScript(() => {
    // Headless test tabs should both handle the concurrent focus signals below.
    Object.defineProperty(document, "visibilityState", { get: () => "visible" });
  });
  await context.route("**/api/v1/auth/refresh", async (route) => {
    refreshes += 1;
    await concurrentRequests;
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
    if (rejectOld && route.request().headers().authorization !== "Bearer renewed") {
      rejected.add(route.request().frame().page());
      return route.fulfill({ status: 401 });
    }
    if (rejectOld) recovered.add(route.request().frame().page());
    return route.fallback();
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Дежурная смена/ })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("button", { name: /Дежурная смена/ })).toBeVisible();
  rejectOld = true;
  try {
    await expect
      .poll(async () => {
        await Promise.all(
          [page, other]
            .filter((tab) => !rejected.has(tab))
            .map((tab) => tab.evaluate(() => window.dispatchEvent(new Event("focus")))),
        );
        return rejected.size;
      })
      .toBe(2);
  } finally {
    releaseRefresh();
  }
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
  await expect(page.getByText("Подключение…", { exact: true })).toBeHidden();
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

test("открывает меню редактора наведением и сохраняет форматирование", async ({
  page,
}) => {
  await page.route("**/v1/resources/tickets/search?*", (route) =>
    route.fulfill({
      json: [{ ref: { resourceId }, number: "INC-228", title: "Доступ к VPN" }],
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const editor = page.getByRole("textbox", { name: "Текст сообщения" });
  await editor.fill("Проверка");
  await page.getByRole("button", { name: "Эмодзи" }).hover();
  await expect(page.getByRole("group", { name: "Выбрать эмодзи" })).toBeVisible();
  await editor.hover();
  await expect(page.getByRole("group", { name: "Выбрать эмодзи" })).toBeHidden();
  const paperclip = page.getByRole("button", { name: "Вложение", exact: true });
  expect((await paperclip.boundingBox())!.x).toBeLessThan(
    (await editor.boundingBox())!.x,
  );
  await paperclip.hover();
  for (const name of ["Документ", "Фото или видео", "Статья", "Музыка"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const chooser = page.waitForEvent("filechooser");
  await paperclip.click();
  await chooser;
  await page.getByRole("button", { name: "Заявка", exact: true }).hover();
  await page.getByRole("option", { name: /INC-228/ }).click();
  await expect(page.getByRole("button", { name: "Убрать #INC-228" })).toBeVisible();
  await editor.selectText();
  await editor.press("Control+b");
  await expect(editor).toHaveValue("**Проверка**");
});

test("переключает два закрепа и загружает отсутствующий в снимке", async ({ page }) => {
  await page.route("**/v1/conversations/" + chatId + "/pins", (route) =>
    route.fulfill({
      json: [
        { messageId: replyId, pinnedAt: "2026-11-24T09:30:00Z" },
        { messageId: sourceId, pinnedAt: "2026-11-24T09:00:00Z" },
      ],
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const first = page.getByRole("button", { name: /Закреплённое сообщение 1 \/ 2/ });
  await expect(first).toContainText("Уже есть заявка.");
  await first.click();
  const second = page.getByRole("button", { name: /Закреплённое сообщение 2 \/ 2/ });
  await expect(second).toContainText("Проверяем доступ к VPN.");
  const history = page.waitForRequest((request) => {
    const params = new URL(request.url()).searchParams;
    return params.get("aroundMessageId") === sourceId && params.get("limit") === "50";
  });
  await second.click();
  await history;
  await expect(
    page.getByText("Проверяем доступ к VPN.", { exact: true }),
  ).toBeVisible();
});

test("рисует Markdown и отображает активность участников", async ({ page }) => {
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket("**/v1/ws?*", (route) => {
    socket = route;
  });
  await page.route("**/v1/conversations/" + chatId + "/snapshot?*", (route) =>
    route.fulfill({
      json: {
        conversation: chat,
        membership: { historyFromSeq: 1 },
        messages: [
          {
            ...source,
            content: {
              blocks: [
                {
                  type: "text",
                  text: "**привет** и *курсив* ||скрыто|| [ссылка](https://example.com)",
                },
              ],
            },
          },
        ],
        snapshotEventSeq: 81,
      },
    }),
  );
  await page.route("**/v1/conversations/" + chatId + "/presence", (route) =>
    route.fulfill({ json: [{ userId, status: "online" }] }),
  );
  await page.route("**/v1/conversations/" + chatId + "/members", (route) =>
    route.fulfill({ json: [{ principalId: source.senderId, role: "member" }] }),
  );
  await page.route("**/api/v1/users/" + source.senderId, (route) =>
    route.fulfill({ json: { id: source.senderId, full_name: "Анна Смирнова" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await expect(
    page.locator("strong").getByText("привет", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("em").getByText("курсив", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "ссылка" })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  const spoiler = page.getByRole("button", { name: "Показать скрытый текст" });
  await spoiler.click();
  await expect(
    page.getByRole("button", { name: "скрыто", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByText("привет", { exact: true }).hover();
  await expect(page.getByRole("button", { name: "Действия с сообщением" })).toHaveCount(
    0,
  );
  await expect(page.getByText(/1 в сети/)).toBeVisible();
  await expect.poll(() => !!socket).toBe(true);
  const activity = (type: string, status: string) =>
    socket!.send(
      JSON.stringify({
        type,
        payload: { conversationId: chatId, userId: source.senderId, status },
      }),
    );
  activity("typing.updated", "started");
  const typing = page.getByText("Анна Смирнова печатает…");
  const recording = page.getByText("Анна Смирнова записывает аудио…");
  await expect(typing).toBeVisible();
  activity("recording_audio.updated", "started");
  await expect(recording).toBeVisible();
  await expect(typing).toBeHidden();
  activity("recording_audio.updated", "stopped");
  await expect(recording).toBeHidden();
  await expect(typing).toBeVisible();
  activity("typing.updated", "stopped");
  await expect(typing).toBeHidden();
});

test("открывает заявку по номеру и запрашивает защищённую ссылку на её вложение", async ({
  page,
  context,
}) => {
  const attachmentId = "ab123456-3456-4000-8000-123456789012";
  await page.route("**/v1/conversations/" + chatId + "/snapshot?*", (route) =>
    route.fulfill({
      json: {
        conversation: chat,
        membership: { historyFromSeq: 1 },
        messages: [
          {
            ...reply,
            content: {
              blocks: [
                { type: "text", text: "Посмотрите #INC-228" },
                reply.content.blocks[1],
              ],
            },
          },
        ],
        snapshotEventSeq: 81,
      },
    }),
  );
  await page.route("**/v1/resources/preview?*", (route) =>
    route.fulfill({
      json: {
        ref: { resourceId },
        number: "INC-228",
        title: "Нет доступа к VPN",
        status: "in_progress",
        priority: "high",
        ticketType: "Инцидент",
        access: "full",
        assigneeDisplayName: "Анна Смирнова",
        description: "Ошибка подключения",
        attachments: [
          {
            id: attachmentId,
            filename: "vpn.log",
            size: 72,
            contentType: "text/plain",
          },
        ],
        activity: [{ action: "ticket.created", occurredAt: "2026-11-24T09:00:00Z" }],
      },
    }),
  );
  const externalUrl = "https://files.example.invalid/vpn-desk.log";
  await context.route(externalUrl, (route) => route.fulfill({ body: "VPN test log" }));
  await page.route("**/attachments/" + attachmentId + "/access?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("conversationId")).toBe(
      chatId,
    );
    return route.fulfill({ json: { url: externalUrl } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const card = page
    .getByRole("group", { name: "Прикреплённые заявки" })
    .getByRole("article", { name: "INC-228" });
  await expect(card.getByRole("button", { name: /Подробнее/ })).toBeVisible();
  await expect(card).toContainText("Анна Смирнова");
  await expect(card).toContainText("DIO Desk · Инцидент");
  await expect(card).toContainText("P2 · Высокий");
  await expect(card).toContainText("Ошибка подключения");
  await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".dio-chat-canvas")).toHaveCSS("background-image", "none");
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(card).toHaveCSS("background-color", "rgb(48, 52, 59)");
  await expect(page.locator(".dio-chat-canvas")).toHaveCSS("background-image", "none");
  await context.route("**/tickets/INC-228", (route) =>
    route.fulfill({ body: "Заявка INC-228" }),
  );
  const cardTab = page.waitForEvent("popup");
  await card.getByRole("link", { name: "Открыть в DIO Desk" }).click();
  await expect(await cardTab).toHaveURL(/\/tickets\/INC-228$/);
  await expect(
    page.locator(".dio-message-text").getByRole("button", { name: /Подробнее/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "#INC-228", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Контекст заявки" });
  await expect(panel.getByRole("heading", { name: "Нет доступа к VPN" })).toBeVisible();
  await expect(panel.getByText("P2 · Высокий")).toBeVisible();
  await expect(panel.getByText("Создана заявка")).toBeVisible();
  const popup = page.waitForEvent("popup");
  await panel.getByRole("button", { name: /vpn.log/ }).click();
  await expect(await popup).toHaveURL(externalUrl);
  const deskTab = page.waitForEvent("popup");
  await panel.getByRole("button", { name: /Открыть в DIO Desk/ }).click();
  await expect(await deskTab).toHaveURL(/\/tickets\/INC-228$/);
});

test("получает новое сообщение и реакцию, пришедшую во время загрузки событий", async ({
  page,
}) => {
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket("**/v1/ws?*", (route) => {
    socket = route;
  });
  let live = false;
  let pulse!: () => void;
  const gate = new Promise<void>((resolve) => {
    pulse = resolve;
  });
  const newId = "01000000-0000-4000-8000-000000000082";
  const created = {
    id: newId,
    conversationId: chatId,
    seq: 82,
    type: "message.created",
    payload: {
      messageId: newId,
      senderId: source.senderId,
      createdSeq: 82,
      createdAt: new Date().toISOString(),
      content: { blocks: [{ type: "text", text: "Проверка realtime" }] },
    },
  };
  const reaction = {
    id: resourceId,
    conversationId: chatId,
    seq: 83,
    type: "reaction.added",
    payload: {
      messageId: newId,
      actorId: source.senderId,
      emoji: "🔥",
    },
  };
  await page.route("**/v1/conversations/" + chatId + "/events?*", async (route) => {
    if (!live) return route.fulfill({ json: [] });
    const after = new URL(route.request().url()).searchParams.get("afterSeq");
    if (after === "81") {
      await gate;
      return route.fulfill({ json: [created] });
    }
    return route.fulfill({ json: after === "82" ? [reaction] : [] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await expect(page.getByText("Уже есть заявка.", { exact: true })).toBeVisible();
  await expect.poll(() => !!socket).toBe(true);
  live = true;
  const requested = page.waitForRequest((request) =>
    request.url().includes("/events?afterSeq=81"),
  );
  socket!.send(
    JSON.stringify({
      type: created.type,
      payload: { conversationId: chatId, eventSeq: 82 },
    }),
  );
  try {
    await requested;
    socket!.send(
      JSON.stringify({
        type: reaction.type,
        payload: { conversationId: chatId, eventSeq: 83 },
      }),
    );
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 30)));
  } finally {
    pulse();
  }
  await expect(
    page.getByRole("main").getByText("Проверка realtime", { exact: true }),
  ).toBeVisible({
    timeout: 2000,
  });
  await expect(page.getByRole("button", { name: "🔥 1", exact: true })).toBeVisible({
    timeout: 2000,
  });
});

test("оставляет фокус в редакторе после отправки и показывает оформление столбцом", async ({
  page,
}) => {
  await page.route("**/v1/conversations/" + chatId + "/messages", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 201,
      json: {
        id: crypto.randomUUID(),
        clientMessageId: route.request().postDataJSON().clientMessageId,
        createdSeq: 82,
        eventSeq: 82,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const editor = page.getByRole("textbox", { name: "Текст сообщения" });
  await editor.fill("Первое сообщение");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(editor).toHaveValue("");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Второе");
  await expect(editor).toHaveValue("Второе");
  const formatting = page.getByRole("button", { name: "Форматирование" });
  await expect(formatting).toBeEnabled();
  await editor.hover();
  await formatting.hover();
  await expect(page.getByRole("group", { name: "Формат текста" })).toHaveCSS(
    "flex-direction",
    "column",
  );
});

test("открывает изображение внутри чата и возвращает фокус к вложению", async ({
  page,
}) => {
  const assetId = "fedcba98-7654-4000-8000-abcdef123456";
  const imageUrl = "http://localhost:9010/preview.png";
  await page.route("**/v1/conversations/" + chatId + "/snapshot?*", (route) =>
    route.fulfill({
      json: {
        conversation: chat,
        membership: { historyFromSeq: 1 },
        messages: [
          {
            ...source,
            content: {
              blocks: [
                { type: "text", text: "Подпись к логотипу" },
                { type: "media", assetId },
              ],
            },
          },
        ],
        snapshotEventSeq: 81,
      },
    }),
  );
  await page.route("**/v1/media/" + assetId, (route) =>
    route.fulfill({
      json: {
        id: assetId,
        filename: "preview.png",
        size: 68,
        contentType: "image/png",
        status: "ready",
        meta: { type: "image", width: 1, height: 1 },
      },
    }),
  );
  await page.route("**/v1/media/" + assetId + "/access", (route) =>
    route.fulfill({
      json: { url: imageUrl, expiresAt: new Date(Date.now() + 60_000).toISOString() },
    }),
  );
  await page.route("**/v1/media/" + assetId + "/gallery?*", (route) =>
    route.fulfill({
      json: { position: 3, total: 7, senderId: userId, sentAt: source.createdAt },
    }),
  );
  await page.route("**/v1/media/" + assetId + "/content", (route) =>
    route.fulfill({
      contentType: "image/png",
      path: transparentPng,
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const opener = page.getByRole("button", { name: /preview\.png/ });
  await expect(opener).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const caption = page.getByText("Подпись к логотипу", { exact: true });
  await expect(caption).toBeVisible();
  await expect(opener.getByRole("img")).toHaveAttribute("width", "1024");
  const imageBounds = (await opener.boundingBox())!;
  expect(imageBounds.width).toBeGreaterThan(300);
  const bubble = page.locator(".dio-message-text").filter({ has: opener });
  const bubbleBounds = (await bubble.boundingBox())!;
  expect(imageBounds.x).toBeCloseTo(bubbleBounds.x, 0);
  expect(imageBounds.width).toBeCloseTo(bubbleBounds.width, 0);
  const captionBounds = (await caption.boundingBox())!;
  const timeBounds = (await bubble.locator("time").boundingBox())!;
  expect(captionBounds.y).toBeGreaterThanOrEqual(imageBounds.y + imageBounds.height);
  expect(timeBounds.y).toBeLessThan(captionBounds.y + captionBounds.height);
  await opener.click();
  const viewer = page.getByRole("dialog", { name: "Предпросмотр preview.png" });
  await expect(viewer.getByRole("img")).toHaveAttribute("src", /^blob:/);
  await expect(viewer.getByText("Фото 3 из 7")).toBeVisible();
  await expect(viewer.locator("time")).toHaveAttribute(
    "datetime",
    new Date(source.createdAt).toISOString(),
  );
  await expect(viewer.getByText("Вы", { exact: false })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const bounds = await viewer.boundingBox();
  expect(bounds?.width).toBe(dimensions.width);
  expect(bounds?.height).toBe(dimensions.height);
  const download = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "Скачать файл" }).click();
  expect((await download).suggestedFilename()).toBe("preview.png");
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("сохраняет размеры и положение ленты при фоновой синхронизации после возврата", async ({
  page,
}) => {
  let hold = false;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/v1/sync/manifest", async (route) => {
    if (hold) await gate;
    return route.fallback();
  });
  const messages = Array.from({ length: 45 }, (_, index) => ({
    ...source,
    id: crypto.randomUUID(),
    createdSeq: index + 1,
    content: { blocks: [{ type: "text", text: "Сообщение истории " + (index + 1) }] },
  }));
  await page.route("**/v1/conversations/" + chatId + "/snapshot?*", (route) =>
    route.fulfill({
      json: {
        conversation: chat,
        membership: { historyFromSeq: 1 },
        messages,
        snapshotEventSeq: 81,
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const history = page.getByRole("region", { name: "История сообщений" });
  await expect(
    history.getByText("Сообщение истории 45", { exact: true }),
  ).toBeInViewport();
  await expect(page.getByText("Подключение…", { exact: true })).toBeHidden();
  await page.waitForLoadState("networkidle");
  await history.evaluate(async (root) => {
    root.scrollTop -= 400;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  const readPosition = () =>
    history.evaluate((root) => ({
      top: root.getBoundingClientRect().top,
      height: root.clientHeight,
      offset: root.scrollTop,
    }));
  const before = await readPosition();
  hold = true;
  const request = page.waitForRequest("**/v1/sync/manifest");
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await request;
    await expect(page.getByText("Подключение…", { exact: true })).toBeHidden();
    expect(await readPosition()).toEqual(before);
  } finally {
    finish();
  }
  await page.waitForLoadState("networkidle");
  expect(await readPosition()).toEqual(before);
});

test("создание группы сохраняет фото, описание и выбор участников между шагами", async ({
  page,
}) => {
  const member = {
    id: sourceId,
    fullName: "Анна Смирнова",
    email: "anna@example.test",
  };
  let body: Record<string, unknown> = {};
  await page.route("**/v1/directory/users?*", (route) =>
    route.fulfill({ json: [member] }),
  );
  await page.route("**/v1/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    body = route.request().postDataJSON();
    return route.fulfill({ json: { id: resourceId, type: "group", ...body } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Новый чат" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Группа", exact: true }).click();
  await dialog.getByRole("button", { name: "Далее" }).click();
  const name = dialog.getByLabel("Название группы");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("Проект");
  await dialog.getByLabel("Описание (по желанию)").fill("Рабочая группа");
  await dialog.locator("input[type=file]").setInputFiles(transparentPng);
  await dialog.getByRole("button", { name: "Далее" }).click();
  await dialog.getByRole("button", { name: /Анна Смирнова/ }).click();
  await dialog.getByRole("button", { name: "Назад" }).click();
  await expect(name).toHaveValue("Проект");
  await dialog.getByRole("button", { name: "Далее" }).click();
  await dialog.getByRole("button", { name: "Создать группу" }).click();
  await expect(page.getByRole("heading", { name: "Проект" })).toBeVisible();
  expect(body).toMatchObject({
    title: "Проект",
    description: "Рабочая группа",
    memberIds: [sourceId],
    avatarUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
  });
});

test("из участника группы открывается профиль и личная переписка с именем", async ({
  page,
}) => {
  await page.route("**/members", (route) =>
    route.fulfill({ json: [{ principalId: sourceId, role: "member" }] }),
  );
  await page.route("**/api/v1/users/" + sourceId, (route) =>
    route.fulfill({
      json: { id: sourceId, username: "anna", full_name: "Анна Смирнова" },
    }),
  );
  await page.route("**/conversations/direct", (route) =>
    route.fulfill({ json: { id: resourceId, type: "direct", peerId: sourceId } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  await page.getByRole("button", { name: /Информация о беседе/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Анна Смирнова/ })
    .click();
  const profile = page.getByRole("dialog", { name: "Профиль", exact: true });
  await expect(profile.getByText("@anna")).toBeVisible();
  await profile.getByRole("button", { name: "Написать сообщение" }).click();
  await expect(page.getByRole("heading", { name: "Анна Смирнова" })).toBeVisible();
  await expect(
    page.locator("li button").filter({ hasText: "Анна Смирнова" }),
  ).toBeVisible();
});

test("тема сохраняет собственную историю и черновик, отправка передаёт threadId", async ({
  page,
}) => {
  const topics: { id: string; title: string }[] = [];
  const sent: string[] = [];
  await page.route("**/threads", async (route) => {
    if (route.request().method() === "POST") {
      const t = { id: resourceId, title: route.request().postDataJSON().title };
      topics.push(t);
      return route.fulfill({ json: t });
    }
    return route.fulfill({ json: topics });
  });
  await page.route("**/messages?*threadId=*", (route) =>
    route.fulfill({
      json: [
        {
          ...source,
          id: otherChatId,
          threadId: resourceId,
          createdSeq: 20,
          content: { blocks: [{ type: "text", text: "История темы" }] },
        },
      ],
    }),
  );
  await page.route("**/messages", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const data = route.request().postDataJSON();
    sent.push(data.threadId);
    return route.fulfill({
      json: {
        id: crypto.randomUUID(),
        clientMessageId: data.clientMessageId,
        eventSeq: 82,
        createdSeq: 82,
        revision: 1,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Дежурная смена/ }).click();
  const editor = page.getByRole("textbox", { name: "Текст сообщения" });
  await editor.fill("Черновик общего чата");
  await page.getByRole("button", { name: /Темы.*Общий чат/ }).click();
  await page.getByRole("button", { name: "Создать тему" }).click();
  await page.getByLabel("Название темы").fill("Поставка");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("История темы", { exact: true })).toBeVisible();
  await expect(editor).toHaveValue("");
  await editor.fill("Первое сообщение темы");
  await editor.press("Enter");
  await expect.poll(() => sent).toEqual([resourceId]);
  await editor.fill("Черновик темы");
  const list = page.getByRole("navigation", { name: "Темы группы" });
  await list.getByRole("button", { name: /Общий чат/ }).click();
  await expect(editor).toHaveValue("Черновик общего чата");
  await expect(page.getByText("История темы", { exact: true })).toBeHidden();
  await list.getByRole("button", { name: /Поставка/ }).click();
  await expect(editor).toHaveValue("Черновик темы");
});
