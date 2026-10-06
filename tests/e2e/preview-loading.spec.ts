import { test, expect, type Page } from "./fixtures";
import { testGLB } from "../glb-fixture";

const headers = { "X-Habitat-Request": "1" };

async function existingItem(page: Page, name: string) {
  await page.context().clearCookies();
  const login = await page.request.post("/api/auth/login", {
    headers,
    data: {
      email: "admin@example.test",
      password: "Admin test passphrase 42!",
    },
  });
  expect(login.ok()).toBeTruthy();
  const brands = await (
    await page.request.post("/api/admin/item-brands", {
      headers,
      data: { name: `Preview ${Date.now()}` },
    })
  ).json();
  const response = await page.request.post("/api/admin/items", {
    headers,
    data: { name, brandId: brands.at(-1).id, categoryId: "sofa" },
  });
  expect(response.ok()).toBeTruthy();
  const item = await response.json();
  const model = await page.request.post(`/api/admin/items/${item.id}/model`, {
    headers: {
      ...headers,
      "Content-Type": "application/octet-stream",
      "X-File-Name": "preview.glb",
    },
    data: testGLB(),
  });
  expect(model.ok()).toBeTruthy();
  return item;
}

test("opening an existing item recovers from an interrupted preview module download", async ({
  page,
}) => {
  const item = await existingItem(page, "Preview recovery sofa");
  const attempts: URL[] = [];
  await page.route("**/src/features/items/ModelPreview*", (route) => {
    attempts.push(new URL(route.request().url()));
    return attempts.length === 1 ? route.abort("failed") : route.continue();
  });
  await page.goto("/admin/items");
  await page.getByRole("link").filter({ hasText: item.name }).click();
  await expect(page.getByText("Model loaded", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(attempts[0].search).toBe("");
  // Vite may request both ?import and the canonical retry URL. There should
  // still be just one fresh attempt, identified by its cache-busting value.
  const retries = attempts
    .slice(1)
    .map((url) => url.searchParams.get("preview-retry"));
  expect(retries.length).toBeGreaterThan(0);
  expect(retries.every((value) => value !== null)).toBe(true);
  expect(new Set(retries).size).toBe(1);
  await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Front view" })).toBeEnabled();
});

test("a persistent preview failure stays inside the viewer and item details can still be saved", async ({
  page,
}) => {
  const item = await existingItem(page, "Preview unavailable sofa");
  let attempts = 0;
  await page.route("**/src/features/items/ModelPreview*", (route) => {
    attempts++;
    return route.abort("failed");
  });
  await page.goto("/admin/items");
  await page.getByRole("link").filter({ hasText: item.name }).click();
  await expect(page.getByRole("alert")).toContainText(
    "3D preview couldn’t load",
  );
  expect(attempts).toBe(2);
  await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
  await page
    .getByRole("button", { name: "1. Product information", exact: true })
    .click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Saved with unavailable preview");
  await page
    .getByRole("button", { name: "Save information", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/admin/items/${item.id}`)).json())
          .name,
    )
    .toBe("Saved with unavailable preview");
  // Full reload clears the browser's failed module record once service recovers.
  await page.unroute("**/src/features/items/ModelPreview*");
  await page.reload();
  await expect(page.getByText("Model loaded", { exact: true })).toBeVisible({
    timeout: 30000,
  });
});
