import { test, expect } from "@playwright/test";
const headers = { "X-Habitat-Request": "1" };
test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth/login", {
    headers,
    data: { email: "user@example.test", password: "User test passphrase 42!" },
  });
  await page.request.patch("/api/account/display", {
    headers,
    data: { theme: "blue", lengthDisplayUnit: "CM" },
  });
});
test("four themes, keyboard selection, immediate units, persisted reload, cache clearing and another device", async ({
  page,
  browser,
}) => {
  await page.goto("/settings/display");
  await expect(
    page.getByRole("heading", { name: "Display & Appearance" }),
  ).toBeVisible();
  await expect(page.locator(".theme-options input")).toHaveCount(4);
  await expect(page.locator(".display-live")).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: "Studio Light", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: "Midnight Cobalt", exact: true }),
  ).toHaveCount(0);
  for (const [name, id] of [
    ["Blue", "blue"],
    ["Night", "night"],
    ["Terra", "terra"],
    ["Sage Stone", "sage-stone"],
  ]) {
    await page.getByRole("radio", { name, exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", id!);
    await expect(page.getByRole("status")).toHaveText("All preferences saved");
    await page.screenshot({
      path: `test-results/display-${id}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("radio", { name: "Blue", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "Night", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Meters", exact: true }).check();
  await expect(page.locator(".measurement-sample strong")).toHaveText(
    "2.40 × 0.90 × 0.75 m",
  );
  await expect(page.getByRole("status")).toHaveText("All preferences saved");
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me).toMatchObject({ theme: "night", lengthDisplayUnit: "M" });
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem(`habitat:display-preferences:${id}`)!),
      me.id,
    ),
  ).toMatchObject({
    version: 1,
    userId: me.id,
    preferences: { theme: "night", lengthDisplayUnit: "M" },
  });
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Night", exact: true }),
  ).toBeChecked();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Night", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Meters", exact: true }),
  ).toBeChecked();
  const other = await browser.newContext();
  await other.request.post("http://127.0.0.1:4187/api/auth/login", {
    headers,
    data: { email: "user@example.test", password: "User test passphrase 42!" },
  });
  const device = await other.newPage();
  await device.goto("http://127.0.0.1:4187/settings/display");
  await expect(
    device.getByRole("radio", { name: "Night", exact: true }),
  ).toBeChecked();
  await other.close();
});
test("normal route navigation reuses runtime preferences without additional reads", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "GET" &&
      /\/api\/(auth\/me|account\/display)$/.test(r.url())
    )
      reads.push(r.url());
  });
  await page.goto("/settings/display");
  await expect(
    page.getByRole("radio", { name: "Terra", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Terra", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("All preferences saved");
  const count = reads.length;
  expect(count).toBe(1);
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page
    .getByRole("link", { name: "Product collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test Architect", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Display & Appearance", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Terra", exact: true }),
  ).toBeChecked();
  expect(reads).toHaveLength(count);
});
test("failed saves retain visible choice, retry successfully, and logout clears the theme before another login", async ({
  page,
}) => {
  await page.goto("/settings/display");
  await page.route("**/api/account/display", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Offline" }),
    }),
  );
  await page.getByRole("radio", { name: "Night", exact: true }).check();
  await expect(page.getByRole("status")).toContainText("sync pending");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await page.unroute("**/api/account/display");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("All preferences saved");
  await page
    .getByRole("button", { name: "Test Architect", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Admin test passphrase 42!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "night");
});
test("dark and light themes cover shared surfaces and narrow layouts", async ({
  page,
}) => {
  await page.goto("/settings/display");
  for (const [name, dark] of [
    ["Night", true],
    ["Terra", false],
    ["Sage Stone", false],
    ["Blue", false],
  ] as const) {
    await page.getByRole("radio", { name, exact: true }).check();
    const surfaces = await page
      .locator(".global-header, .global-rail, .theme-card")
      .evaluateAll((els) =>
        els.map((e) => getComputedStyle(e).backgroundColor),
      );
    for (const color of surfaces) {
      const values = color.match(/\d+/g)!.slice(0, 3).map(Number);
      expect(values.reduce((a, b) => a + b, 0) / 3 < 80).toBe(dark);
    }
    await page.locator(".display-back").click();
    await expect(page.locator(".account-card").first()).toBeVisible();
    await page.screenshot({
      path: `test-results/account-${name.replaceAll(" ", "-")}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Display & Appearance", exact: true })
      .click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("radio", { name: "Meters", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/display-mobile.png",
    fullPage: true,
  });
});

test("session verification never paints another account's cached theme", async ({
  page,
}) => {
  await page.goto("/settings/display");
  await page.getByRole("radio", { name: "Terra", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("All preferences saved");
  await page.request.post("/api/auth/login", {
    headers,
    data: {
      email: "admin@example.test",
      password: "Admin test passphrase 42!",
    },
  });
  await page.request.patch("/api/account/display", {
    headers,
    data: { theme: "night" },
  });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await wait;
    await route.continue();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-session", "loading");
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "terra");
  expect(
    await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(24, 27, 30)");
  release();
  await expect(
    page.getByRole("radio", { name: "Night", exact: true }),
  ).toBeChecked();
  await page.request.patch("/api/account/display", {
    headers,
    data: { theme: "blue" },
  });
});

test("editor, catalog, account and menus share theme state without route reads", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    headers,
    data: {
      email: "editor@example.test",
      password: "Editor test passphrase 42!",
    },
  });
  await page.request.patch("/api/account/display", {
    headers,
    data: { theme: "night" },
  });
  let reads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/auth/me")) reads++;
  });
  await page.goto("/projects");
  await page.locator(".project-card").first().click();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await page.screenshot({ path: "test-results/editor-night.png" });
  for (const selector of [
    ".canvas-toolbar",
    ".global-header",
    ".global-rail",
  ]) {
    await expect(page.locator(selector)).toHaveCSS(
      "background-color",
      "rgb(24, 27, 30)",
    );
  }
  await page
    .getByRole("link", { name: "Product collection", exact: true })
    .click();
  await page.screenshot({ path: "test-results/catalog-night.png" });
  await page.getByRole("button", { name: "Test Editor", exact: true }).click();
  await expect(page.locator(".user-popover")).toHaveCSS(
    "background-color",
    "rgb(24, 27, 30)",
  );
  await page
    .getByRole("link", { name: "Display & Appearance", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Night", exact: true }),
  ).toBeChecked();
  expect(reads).toBe(1);
  await page.request.patch("/api/account/display", {
    headers,
    data: { theme: "blue" },
  });
});
