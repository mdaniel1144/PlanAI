import { readFileSync } from "node:fs";
import { test, expect, type Page } from "./fixtures";
import { testGLB } from "../glb-fixture";
import { verifiedDimensions } from "../dimension-fixture";
const headers = { "X-Habitat-Request": "1" };
async function setup(page: Page, suffix: string) {
  await page.context().clearCookies();
  await page.request.post("/api/auth/login", {
    headers,
    data: {
      email: "admin@example.test",
      password: "Admin test passphrase 42!",
    },
  });
  const brands = await (
    await page.request.post("/api/admin/item-brands", {
      headers,
      data: { name: `Items ${suffix} ${Date.now()}` },
    })
  ).json();
  let item = await (
    await page.request.post("/api/admin/items", {
      headers,
      data: {
        name: `Studio sofa ${suffix}`,
        brandId: brands.at(-1).id,
        categoryId: "sofa",
        basePriceMinor: 100,
      },
    })
  ).json();
  const path = `/api/admin/items/${item.id}`;
  const asset = await (
    await page.request.post(`${path}/model`, {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "X-File-Name": "sofa.glb",
      },
      data: testGLB(),
    })
  ).json();
  expect(
    (
      await page.request.patch(`${path}/assets/${asset.id}/calibration`, {
        headers,
        data: verifiedDimensions({
          width: 2.4,
          depth: 0.95,
          height: 0.82,
          orientation: 0,
          confirmed: true,
        }),
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post(`${path}/color-targets`, {
        headers,
        data: { targets: [{ materialIndex: 0, nodeIndex: 0 }] },
      })
    ).ok(),
  ).toBeTruthy();
  for (const [name, baseColor] of [
    ["Linen", "#c3b394"],
    ["Moss", "#63785d"],
  ])
    expect(
      (
        await page.request.post(`${path}/colors`, {
          headers,
          data: { name, baseColor, status: "ACTIVE" },
        })
      ).ok(),
    ).toBeTruthy();
  expect(
    (
      await page.request.post(`${path}/thumbnails`, {
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
          "X-File-Name": "sofa.png",
        },
        data: readFileSync(
          new URL("../../fixtures/catalog-thumbnail.png", import.meta.url),
        ),
      })
    ).ok(),
  ).toBeTruthy();
  const published = await page.request.patch(path, {
    headers,
    data: { status: "ACTIVE" },
  });
  expect(published.ok()).toBeTruthy();
  item = await published.json();
  await page.request.post("/api/auth/logout", { headers });
  await page.request.post("/api/auth/login", {
    headers,
    data: {
      email: "editor@example.test",
      password: "Editor test passphrase 42!",
    },
  });
  await page.request.patch("/api/account/display", {
    headers,
    data: { theme: "blue", lengthDisplayUnit: "M" },
  });
  const project = await (
    await page.request.post("/api/projects", {
      headers,
      data: { name: `Items tool ${suffix}` },
    })
  ).json();
  const scene = await (
    await page.request.post(`/api/projects/${project.id}/scenes`, {
      headers,
      data: { floorName: "Main", elevation: 2.4 },
    })
  ).json();
  await page.goto(`/projects/${project.id}/editor`);
  return { item, scene };
}
async function point(page: Page, x: number, y: number) {
  return page.locator(".plan-svg").evaluate(
    (el, p) => {
      const q = new DOMPoint(p.x, p.y).matrixTransform(
        (el as SVGSVGElement).getScreenCTM()!,
      );
      return { x: q.x, y: q.y };
    },
    { x, y },
  );
}
async function choose(page: Page, name: string) {
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await page.getByLabel("Search items", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: `Place ${name}`, exact: true })
    .click();
  await expect(page.getByText(/Choose a position on the floor/)).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
}
test("Items shares catalog, caches browsing, supports themes and real-size 2D/3D placement with editor history", async ({
  page,
}) => {
  test.setTimeout(180000);
  const { item, scene } = await setup(page, "workflow");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let reads = 0,
    models = 0;
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/items") reads++;
    if (url.pathname === `/api/item-assets/${item.baseModelAssetId}`) models++;
  });
  const library = page.getByRole("complementary", { name: "Items library" });
  const tool = page
    .locator(".canvas-tools")
    .getByRole("button", { name: "Items", exact: true });
  await tool.click();
  await expect(library).toBeVisible();
  await expect(
    library.getByRole("button", { name: `Place ${item.name}`, exact: true }),
  ).toBeEnabled();
  expect(models).toBe(0);
  const initialReads = reads;
  await page.getByRole("button", { name: "Close Items", exact: true }).click();
  await tool.click();
  await expect(
    library.getByRole("button", { name: `Place ${item.name}`, exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(350);
  expect(reads).toBe(initialReads);
  await page
    .getByLabel("Search items", { exact: true })
    .pressSequentially("Studio sofa", { delay: 20 });
  await expect.poll(() => reads).toBe(initialReads + 1);
  await page.getByLabel("Item category").selectOption("lighting");
  await expect(page.getByText("No items found", { exact: true })).toBeVisible();
  await page.getByLabel("Item category").selectOption("sofa");
  await expect(
    library.getByRole("button", { name: `Place ${item.name}`, exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(library).toBeHidden();
  await expect(tool).toBeFocused();
  // All currently supported global themes; retired theme IDs are not recreated.
  for (const theme of ["blue", "night", "terra", "sage-stone"]) {
    await page.request.patch("/api/account/display", {
      headers,
      data: { theme, lengthDisplayUnit: "CM" },
    });
    await page.reload();
    await tool.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(library.getByText("240 × 95 × 82 cm").first()).toBeVisible();
    expect(
      await library.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(
      await page
        .locator(".canvas-toolbar")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await page.screenshot({
      path: test.info().outputPath(`items-${theme}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Close Items", exact: true })
      .click();
  }
  expect(models).toBe(0);
  const before = await (await page.request.get(`/api/items/${item.id}`)).json();
  expect(before).not.toHaveProperty("dimensionVerification");
  expect(before.assets.every((a: object) => !("storageKey" in a))).toBeTruthy();
  await choose(page, item.name);
  await page.getByRole("button", { name: "Draw wall", exact: true }).click();
  await expect(page.locator(".item-ghost")).toHaveCount(0);
  await expect(page.getByText(/Choose a position on the floor/)).toHaveCount(0);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await choose(page, item.name);
    const p = await point(page, 2 + i * 1.5, 3);
    await page.mouse.move(p.x, p.y);
    await expect(
      page.locator(".item-ghost [data-representation='geometry-outline']"),
    ).toBeVisible();
    await expect(page.locator("[data-item-instance]")).toHaveCount(i);
    if (i === 0)
      await page
        .getByRole("button", { name: "Rotate 90°", exact: true })
        .click();
    await page.mouse.click(p.x, p.y);
    await expect(page.locator("[data-item-instance]")).toHaveCount(i + 1);
  }
  expect(models).toBe(1);
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  await choose(page, item.name);
  await expect(page.locator(".three-view canvas")).toBeVisible();
  const canvas = page.locator(".three-view canvas");
  const box = await canvas.boundingBox();
  await canvas.hover({
    position: { x: box!.width * 0.6, y: box!.height * 0.65 },
  });
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-item-ghost",
    new RegExp(item.id),
  );
  await page.screenshot({
    path: test.info().outputPath("items-3d-ghost.png"),
    fullPage: true,
  });
  await canvas.click({
    position: { x: box!.width * 0.6, y: box!.height * 0.65 },
  });
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-item-ghost",
    "",
  );
  await page.getByLabel("Rotation (degrees)").fill("45");
  await save(page);
  const saved = await (
    await page.request.get(`/api/scenes/${scene.id}`)
  ).json();
  expect(saved.floors[0].itemInstances).toHaveLength(5);
  for (const i of saved.floors[0].itemInstances) {
    expect(i.modelAssetId).toBe(item.baseModelAssetId);
    expect(i.floorId).toBe(scene.floors[0].id);
    expect(i).not.toHaveProperty("width");
  }
  expect(
    saved.floors[0].itemInstances.some(
      (i: { rotation: number }) => Math.abs(i.rotation - Math.PI / 4) < 1e-6,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("[data-item-instance]")).toHaveCount(5);
  const selected = page.locator("[data-item-instance]").first();
  await selected.click();
  const start = await selected.getAttribute("transform");
  const id = await selected.getAttribute("data-item-instance");
  const startPoint = await selected.evaluate((el) => {
    const p = (el as SVGGElement).getCTM()!;
    const q = new DOMPoint(0, 0).matrixTransform(
      (el as SVGGElement).getScreenCTM()!,
    );
    return { x: q.x, y: q.y, tx: p.e };
  });
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(startPoint.x + 35, startPoint.y + 25, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.locator(`[data-item-instance="${id}"]`),
  ).not.toHaveAttribute("transform", start!);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(`[data-item-instance="${id}"]`)).toHaveAttribute(
    "transform",
    start!,
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Remove Item", exact: true }).click();
  await expect(page.locator("[data-item-instance]")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("[data-item-instance]")).toHaveCount(5);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await save(page);
  expect(
    await (await page.request.get(`/api/items/${item.id}`)).json(),
  ).toEqual(before);
  expect(errors).toEqual([]);
});
test("unavailable runtime assets cannot create placements and cancellation leaves no ghost", async ({
  page,
}) => {
  const { item, scene } = await setup(page, "missing asset");
  await page.route(`**/api/item-assets/${item.baseModelAssetId}`, (route) =>
    route.abort("failed"),
  );
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await page
    .getByRole("button", { name: `Place ${item.name}`, exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".item-ghost")).toHaveCount(0);
  await expect(page.getByText(/Choose a position on the floor/)).toHaveCount(0);
  expect(
    (await (await page.request.get(`/api/scenes/${scene.id}`)).json()).floors[0]
      .itemInstances ?? [],
  ).toEqual([]);
  await page.unroute(`**/api/item-assets/${item.baseModelAssetId}`);
  await page
    .getByRole("button", { name: `Place ${item.name}`, exact: true })
    .click();
  await expect(page.getByText(/Choose a position on the floor/)).toBeVisible();
  const p = await point(page, 3, 3);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator(".item-ghost")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".item-ghost")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
});

test("catalog errors remain local and unknown floor elevation prevents placement", async ({
  page,
}) => {
  const { item, scene } = await setup(page, "unknown floor");
  scene.floors[0].elevation = null;
  expect(
    (
      await page.request.put(`/api/scenes/${scene.id}`, {
        headers,
        data: {
          scene,
          expectedRevision: scene.revision,
          writerCapabilities: ["items-v1"],
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await page.route("**/api/items?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Catalog temporarily unavailable" }),
    }),
  );
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Items are unavailable");
  await expect(page.locator(".plan-svg")).toBeVisible();
  await page.unroute("**/api/items?*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("button", { name: `Place ${item.name}`, exact: true })
    .click();
  await expect(page.getByText(/Choose a position on the floor/)).toBeVisible();
  const p = await point(page, 3, 3);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator(".item-ghost")).toHaveAttribute(
    "data-valid",
    "false",
  );
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole("alert")).toContainText(
    "Confirm the selected Space or Floor elevation",
  );
  await expect(page.locator("[data-item-instance]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
});
