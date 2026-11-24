import { expect, test, type Browser, type Page } from "@playwright/test";

const api = process.env.STAGING_MESSENGER_API_URL;
const chatId = process.env.STAGING_CHAT_ID;
const chatTitle = process.env.STAGING_CHAT_TITLE;
const owner = {
  email: process.env.STAGING_OWNER_EMAIL,
  password: process.env.STAGING_OWNER_PASSWORD,
};
const member = {
  email: process.env.STAGING_MEMBER_EMAIL,
  password: process.env.STAGING_MEMBER_PASSWORD,
};
const memberId = process.env.STAGING_MEMBER_ID;
const stateKey = "dio-messenger:auth";

async function signIn(browser: Browser, baseURL: string, credentials: typeof owner) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email!);
  await page.getByLabel("Пароль").fill(credentials.password!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: chatTitle, exact: false }).first(),
  ).toBeVisible();
  return { page, context };
}

async function openChat(page: Page) {
  await page.getByRole("button", { name: chatTitle, exact: false }).first().click();
}

async function compose(page: Page, message: string) {
  await page.getByRole("textbox", { name: "Текст сообщения" }).fill(message);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
}

test.describe.configure({ mode: "serial" });
test.beforeAll(() => {
  if (
    ![
      api,
      chatId,
      chatTitle,
      memberId,
      owner.email,
      owner.password,
      member.email,
      member.password,
    ].every(Boolean)
  ) {
    throw new Error(
      "Configure all STAGING_* variables for the dedicated Messenger test conversation.",
    );
  }
});

test("staging сохраняет офлайн-сообщение и доставляет его второму аккаунту один раз", async ({
  browser,
  baseURL,
}) => {
  const sender = await signIn(browser, baseURL!, owner);
  const reader = await signIn(browser, baseURL!, member);
  try {
    await Promise.all([openChat(sender.page), openChat(reader.page)]);
    await expect
      .poll(() => sender.page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await sender.context.setOffline(true);
    const message = `[staging] offline ${crypto.randomUUID()}`;
    await compose(sender.page, message);
    await expect(sender.page.getByText("В очереди", { exact: true })).toBeVisible();
    await sender.page.reload();
    await openChat(sender.page);
    await expect(
      sender.page.locator("main").getByText(message, { exact: true }),
    ).toBeVisible();
    await sender.context.setOffline(false);
    await expect(
      reader.page.locator("main").getByText(message, { exact: true }),
    ).toHaveCount(1);
    await reader.page.reload();
    await openChat(reader.page);
    await expect(
      reader.page.locator("main").getByText(message, { exact: true }),
    ).toHaveCount(1);
  } finally {
    await Promise.all([sender.context.close(), reader.context.close()]);
  }
});

test("staging восстанавливает истёкший access token в двух вкладках", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await signIn(browser, baseURL!, owner);
  try {
    await page.evaluate((key) => {
      const persisted = JSON.parse(localStorage.getItem(key)!);
      persisted.tokens.expiresAt = Date.now() - 1;
      localStorage.setItem(key, JSON.stringify(persisted));
    }, stateKey);
    const second = await context.newPage();
    await Promise.all([page.reload(), second.goto("/")]);
    await Promise.all([openChat(page), openChat(second)]);
    await expect
      .poll(() =>
        page.evaluate((key) => {
          return (
            JSON.parse(localStorage.getItem(key) ?? "{}").tokens?.expiresAt > Date.now()
          );
        }, stateKey),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
    await expect(second).toHaveURL(/\/login$/);
  } finally {
    await context.close();
  }
});

test("staging очищает отозванную беседу после переподключения", async ({
  browser,
  baseURL,
}) => {
  const manager = await signIn(browser, baseURL!, owner);
  const guest = await signIn(browser, baseURL!, member);
  const token = await manager.page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).tokens.accessToken as string,
    stateKey,
  );
  const headers = { Authorization: `Bearer ${token}` };
  let removed = false;
  try {
    await openChat(guest.page);
    await guest.context.setOffline(true);
    const message = `[staging] revoked ${crypto.randomUUID()}`;
    await compose(guest.page, message);
    await expect(guest.page.getByText("В очереди", { exact: true })).toBeVisible();
    const result = await manager.context.request.delete(
      `${api}/v1/conversations/${chatId}/members/${memberId}`,
      { headers },
    );
    expect(result.status()).toBe(204);
    removed = true;
    await guest.context.setOffline(false);
    await expect(
      guest.page.getByRole("button", { name: chatTitle, exact: false }),
    ).toHaveCount(0);
    await expect(guest.page.getByText(message, { exact: true })).toHaveCount(0);
    await openChat(manager.page);
    await expect(manager.page.getByText(message, { exact: true })).toHaveCount(0);
  } finally {
    try {
      if (removed) {
        const restored = await manager.context.request.post(
          `${api}/v1/conversations/${chatId}/members`,
          {
            headers,
            data: {
              principalId: memberId,
              role: process.env.STAGING_MEMBER_ROLE ?? "member",
            },
          },
        );
        expect(restored.status()).toBe(201);
      }
    } finally {
      await Promise.all([manager.context.close(), guest.context.close()]);
    }
  }
});
