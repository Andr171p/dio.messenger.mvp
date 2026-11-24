import { expect, test } from "@playwright/test";

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

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket("**/v1/ws?*", () => {});
  await page.addInitScript(
    ({ userId }) => {
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
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/ws/tickets")) {
      return route.fulfill({ json: { ticket: "fixture", expiresIn: 60 } });
    }
    if (url.pathname.endsWith("/manifest")) {
      return route.fulfill({
        json: { conversations: [{ conversationId: chatId, lastEventSeq: 81 }] },
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
  const search = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/v1/search/messages",
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
        uploadUrl: "http://127.0.0.1:5173/test-upload",
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
