import { test, expect, type Page } from "@playwright/test";
const admin = {
  email: "admin@example.test",
  password: "Admin test passphrase 42!",
};
const user = {
  email: "user@example.test",
  password: "User test passphrase 42!",
};
async function login(page: Page, credentials = user) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
async function menu(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}
test("unauthenticated routes begin at Login without exposing the shell", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/projects",
    "/projects/00000000-0000-4000-8000-000000000001/editor",
    "/settings/account",
    "/admin/users",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.locator(".global-header")).toHaveCount(0);
  }
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Incorrect password!");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Invalid email or password.",
  );
});
test("USER login, cookie, reload, route guards, accessible account menu and server logout", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(
    page.getByRole("button", { name: "Test Architect", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin · Users" })).toHaveCount(
    0,
  );
  const cookies = await context.cookies();
  const cookie = cookies.find((c) => c.name === "habitat_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  expect(cookie.secure).toBe(false);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "habitat_session",
  );
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Test Architect", exact: true }),
  ).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/projects$/);
  expect((await context.request.get("/api/admin/users")).status()).toBe(403);
  await menu(page, "Test Architect");
  await expect(
    page.getByRole("navigation", { name: "Account menu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Account menu" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Test Architect", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.locator("h1").click();
  await expect(
    page.getByRole("navigation", { name: "Account menu" }),
  ).toHaveCount(0);
  await menu(page, "Test Architect");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Test Architect",
  );
  await expect(page.getByLabel("Role", { exact: true })).toHaveCount(0);
  await menu(page, "Test Architect");
  const logout = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/logout"),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await logout).status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get("/api/projects")).status()).toBe(401);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
test("ADMIN creates, searches, edits, promotes, resets and disables a user", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await login(page, admin);
  await page.getByRole("link", { name: "Admin · Users", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.getByRole("button", { name: "+ Add user", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    email = `new-${Date.now()}@example.test`;
  await dialog.getByLabel("Name", { exact: true }).fill("New Architect");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog
    .getByLabel("Initial password", { exact: true })
    .fill("New user passphrase 42!");
  await dialog
    .getByLabel("Confirm password", { exact: true })
    .fill("New user passphrase 42!");
  await dialog
    .getByRole("button", { name: "Create user", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Search users").fill(email);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "New Architect", exact: true })
    .click();
  await dialog.getByLabel("Name", { exact: true }).fill("Renamed Architect");
  await dialog.getByLabel("Role", { exact: true }).selectOption("ADMIN");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("tbody tr")).toContainText("Administrator");
  await page
    .getByRole("button", { name: "Renamed Architect", exact: true })
    .click();
  await dialog.getByLabel("Role", { exact: true }).selectOption("USER");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Renamed Architect", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await dialog
    .getByLabel("New password", { exact: true })
    .fill("Replacement passphrase 42!");
  await dialog
    .getByLabel("Confirm password", { exact: true })
    .fill("Replacement passphrase 42!");
  await dialog
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Renamed Architect", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Disable user", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toContainText("Disabled");
  await page.screenshot({ path: "test-results/admin-users.png" });
  await menu(page, "Test Administrator");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Replacement passphrase 42!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Invalid email or password.",
  );
  expect(errors).toEqual([]);
});
test("logout in another tab removes protected content on the next interaction", async ({
  page,
  context,
}) => {
  await login(page);
  const second = await context.newPage();
  await second.goto("/projects");
  await expect(
    second.getByRole("button", { name: "Test Architect", exact: true }),
  ).toBeVisible();
  await menu(page, "Test Architect");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await second.goto("/settings/account");
  await expect(second).toHaveURL(/\/login$/);
});
test("account profile/password changes and narrow-screen menu work", async ({
  page,
  context,
}) => {
  await login(page, admin);
  const email = `account-${Date.now()}@example.test`,
    password = "Account test passphrase!";
  const created = await context.request.post("/api/admin/users", {
    headers: { "X-Habitat-Request": "1" },
    data: { name: "Account Tester", email, role: "USER", password },
  });
  expect(created.status()).toBe(201);
  await menu(page, "Test Administrator");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, { email, password });
  await page.setViewportSize({ width: 390, height: 844 });
  await menu(page, "Account Tester");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Updated Tester");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("Incorrect password!");
  await page
    .getByLabel("New password", { exact: true })
    .fill("Updated account passphrase!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Updated account passphrase!");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Current password is incorrect.",
  );
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password changed");
  await menu(page, "Updated Tester");
  const box = await page.locator(".user-popover").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: "test-results/login-mobile.png" });
  await login(page, { email, password: "Updated account passphrase!" });
});
