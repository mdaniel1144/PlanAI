import { verifiedDimensions } from "../dimension-fixture";
import { test, expect } from "./fixtures";
import { colorTargetGLB } from "../glb-fixture";
import { readFileSync } from "node:fs";
test("admin creates and publishes one GLB with Blue, White and Green colors; user browses without management controls", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const png = readFileSync(
    new URL("../../fixtures/catalog-thumbnail.png", import.meta.url),
  );
  const consoleErrors: string[] = [];
  const failedCatalogRequests: { status: number; path: string }[] = [];
  const mutations = { calibrations: 0, colorCreates: 0, publishes: 0 };
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.includes("/api/admin/items") && response.status() >= 400)
      failedCatalogRequests.push({ status: response.status(), path });
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "PATCH" && path.endsWith("/calibration"))
      mutations.calibrations++;
    if (
      request.method() === "POST" &&
      /\/admin\/items\/[^/]+\/colors$/.test(path)
    )
      mutations.colorCreates++;
    if (
      request.method() === "PATCH" &&
      /\/admin\/items\/[^/]+$/.test(path) &&
      request.postDataJSON()?.status === "ACTIVE"
    )
      mutations.publishes++;
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Admin test passphrase 42!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto("/admin/items");
  await page.getByRole("link", { name: "+ Add Item" }).click();
  await page.getByLabel("New brand", { exact: true }).fill("Example Co.");
  await page.getByRole("button", { name: "Add brand", exact: true }).click();
  await expect(
    page
      .getByRole("combobox", { name: "Brand", exact: true })
      .locator("option"),
  ).toHaveCount(2);
  await page.getByLabel("Product name", { exact: true }).fill("Sofa 123");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Sofa" });
  await page
    .getByRole("combobox", { name: "Brand", exact: true })
    .selectOption({ label: "Example Co." });
  await page.getByLabel("Product name", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter a name containing more than spaces",
  );
  await page.getByLabel("Product name", { exact: true }).fill("Sofa 123");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/items\/[0-9a-f-]{36}$/);
  const itemId = page.url().split("/").at(-1)!;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "3D model", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "7. Review & publish", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish product", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await expect(page.getByText(/Invalid UUID/)).toHaveCount(0);
  await page.getByRole("button", { name: "2. 3D model", exact: true }).click();
  await page.getByLabel("Upload GLB").setInputFiles({
    name: "sofa.glb",
    mimeType: "model/gltf-binary",
    buffer: colorTargetGLB(),
  });
  await expect(page.getByText(/sofa.glb · Validated/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Dimensions & orientation",
      exact: true,
    }),
  ).toBeVisible();
  const detected = page.getByText(/Oriented model axes/);
  const beforeOrientation = await detected.textContent();
  await page
    .getByRole("combobox", { name: "Product orientation", exact: true })
    .selectOption("90");
  await expect(detected).not.toHaveText(beforeOrientation!);
  await page
    .getByRole("combobox", { name: "Product orientation", exact: true })
    .selectOption("0");
  await page.getByLabel("Real width (cm)").fill("240");
  await page.getByLabel("Real depth (cm)").fill("95");
  await page.getByLabel("Real height (cm)").fill("82");
  await page
    .getByRole("combobox", { name: "Dimension source", exact: true })
    .selectOption("MANUFACTURER_SPECIFICATION");
  await page
    .getByRole("checkbox", {
      name: "I have verified these dimensions against the real product.",
    })
    .check();
  await expect(
    page.getByRole("button", { name: "Confirm dimensions", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirm dimensions", exact: true })
    .evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
  await expect(
    page.getByText("Real product dimensions verified.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("✓ Automatically generated from 3D model", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const originalThumb = await page
    .getByAltText("Product image", { exact: true })
    .getAttribute("src");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Select color parts", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".item-preview").getByText("Model loaded", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const canvas = page.locator(".item-preview canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // Actual pointer clicks select visible regions; retain Body and Cushion, leave frame authored.
  for (const y of [0.5, 0.4, 0.6]) {
    for (const x of [0.44, 0.5, 0.48, 0.52, 0.4, 0.55, 0.45, 0.6, 0.35, 0.65]) {
      const body = page.getByRole("listitem").filter({ hasText: "Body" }),
        cushion = page.getByRole("listitem").filter({ hasText: "Cushion" });
      if ((await body.count()) && (await cushion.count())) break;
      await canvas.click({
        position: { x: box!.width * x, y: box!.height * y },
      });
      const fixed = page
        .getByRole("listitem")
        .filter({ hasText: "Fixed frame" });
      if (await fixed.count())
        await fixed.getByRole("button", { name: "Remove selection" }).click();
    }
    if (
      (await page.getByRole("listitem").filter({ hasText: "Body" }).count()) &&
      (await page.getByRole("listitem").filter({ hasText: "Cushion" }).count())
    )
      break;
  }
  await expect(
    page.getByText("Selected: 2 regions", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm color parts", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit color parts", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Available colors", exact: true }),
  ).toBeVisible();
  for (const [name, color] of [
    ["Blue", "#0000ff"],
    ["White", "#ffffff"],
    ["Green", "#00ff00"],
  ]) {
    await page
      .getByRole("button", { name: "+ Add Color", exact: true })
      .click();
    await page.getByLabel("Color name", { exact: true }).fill(name);
    await page.getByLabel("Color", { exact: true }).fill(color);
    if (name === "Blue") {
      await page.getByLabel("Upload color texture").setInputFiles({
        name: "fabric.png",
        mimeType: "image/png",
        buffer: png,
      });
      await expect(
        page
          .getByLabel("Texture (optional)")
          .locator("option")
          .filter({ hasText: "fabric.png" }),
      ).toHaveCount(1);
    }
    await page
      .getByRole("button", { name: "Create color", exact: true })
      .evaluate((el) => {
        (el as HTMLButtonElement).click();
        (el as HTMLButtonElement).click();
      });
    await expect(
      page.locator(".color-card").filter({ hasText: name }),
    ).toBeVisible();
    if (name === "Blue") {
      await expect(
        page.getByText("✓ Automatically generated from 3D model", {
          exact: true,
        }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        page
          .locator(".color-card")
          .filter({ hasText: "Blue" })
          .getByText("Default color", { exact: true }),
      ).toBeVisible();
    }
  }
  await page
    .locator(".color-card")
    .filter({ hasText: "White" })
    .getByRole("button", { name: "Set as Default", exact: true })
    .click();
  await expect(
    page
      .locator(".color-card")
      .filter({ hasText: "White" })
      .getByText("Default color", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("✓ Automatically generated from 3D model", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByAltText("Product image", { exact: true }),
  ).not.toHaveAttribute("src", originalThumb!);
  const whiteThumb = await page
    .getByAltText("Product image", { exact: true })
    .getAttribute("src");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Price & SKU", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "6. Price & SKU", exact: true })
    .click();
  await page.getByLabel("Base price", { exact: true }).fill("6900.50");
  await page
    .getByLabel("Base product code / SKU", { exact: true })
    .fill("SOFA-X");
  await page
    .getByRole("button", { name: "Save base price", exact: true })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page
    .getByLabel("SKU override — Blue", { exact: true })
    .fill("X3213-Blue");
  await page
    .getByRole("button", { name: "Save Blue pricing", exact: true })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByAltText("Product image", { exact: true }),
  ).toHaveAttribute("src", whiteThumb!);
  await expect(page.getByLabel("Upload thumbnail")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Review & publish", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Default color: White", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish product", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Publish product", exact: true })
    .evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
  await expect(page.getByText(/ACTIVE · Used in/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Published", exact: true }),
  ).toBeVisible();
  const adminItem = await (
    await page.request.get(`/api/admin/items/${itemId}`)
  ).json();
  expect(
    adminItem.bindings
      .map((b: { materialIndex: number }) => b.materialIndex)
      .sort(),
  ).toEqual([0, 1]);
  expect(adminItem.colors).toHaveLength(3);
  expect(adminItem.thumbnailGeneration.current).toBe(true);
  expect(
    adminItem.assets.find(
      (a: { id: string }) => a.id === adminItem.thumbnailAssetId,
    ).generated,
  ).toMatchObject({
    source: "GENERATED_FROM_GLB",
    width: 512,
    height: 512,
    defaultColorId: adminItem.defaultVariantId,
  });
  expect(
    adminItem.assets.filter((a: { type: string }) => a.type === "GLB_MODEL"),
  ).toHaveLength(1);
  await page.goto("/admin/items");
  let modelRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes(`/api/item-assets/${adminItem.baseModelAssetId}`))
      modelRequests++;
  });
  await page.getByLabel("Search", { exact: true }).fill("X3213-Blue");
  await expect(page.getByRole("link", { name: /Sofa 123/ })).toBeVisible();
  expect(modelRequests).toBe(0);
  await expect(page.getByAltText("Sofa 123", { exact: true })).toHaveAttribute(
    "src",
    whiteThumb!,
  );
  await page.request.post("/api/auth/logout", {
    headers: { "X-Habitat-Request": "1" },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("editor@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Editor test passphrase 42!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/projects");
  const response = await page.request.get(`/api/items/${itemId}`);
  expect(response.status()).toBe(200);
  expect((await response.json()).colors).toHaveLength(3);
  const headers = { "X-Habitat-Request": "1" };
  const project = await (
    await page.request.post("/api/projects", {
      headers,
      data: { name: "Catalog placement project" },
    })
  ).json();
  const scene = await (
    await page.request.post(`/api/projects/${project.id}/scenes`, {
      headers,
      data: { floorName: "Main", elevation: 2.4 },
    })
  ).json();
  const beforeCatalog = await (
    await page.request.get(`/api/items/${itemId}`)
  ).json();
  await page.goto(`/projects/${project.id}/editor`);
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Item catalog" });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Search", { exact: true }).fill("Sofa 123");
  await expect(
    drawer.getByAltText("Sofa 123", { exact: true }),
  ).toHaveAttribute("src", whiteThumb!);
  expect(modelRequests).toBe(0);
  await drawer.getByRole("button", { name: /Sofa 123/ }).click();
  await drawer
    .getByRole("combobox", { name: "Color", exact: true })
    .selectOption({ label: "Blue" });
  await expect(drawer.locator("canvas")).toBeVisible();
  await expect(drawer.getByText("2.40 × 0.95 × 0.82 m")).toBeVisible();
  const detailLoads = modelRequests;
  for (const color of ["White", "Green", "Blue"])
    await drawer
      .getByRole("combobox", { name: "Color", exact: true })
      .selectOption({ label: color });
  await expect(
    drawer.locator(".item-preview").getByText("Model loaded", { exact: true }),
  ).toBeVisible();
  expect(modelRequests).toBe(detailLoads);
  await drawer
    .getByRole("button", { name: "Add to Project", exact: true })
    .click();
  await expect(page.getByText(/Choose a position on the plan/)).toBeVisible();
  const plan = page.locator(".plan-svg");
  await plan.hover({ position: { x: 260, y: 220 } });
  await expect(page.locator(".item-ghost")).toBeVisible();
  await plan.click({ position: { x: 260, y: 220 } });
  await expect(page.locator("[data-item-instance]")).toHaveCount(1);
  await page.getByLabel("Rotation (degrees)").fill("45");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  const saved = await (
    await page.request.get(`/api/scenes/${scene.id}`)
  ).json();
  expect(saved.floors[0].itemInstances[0].rotation).toBeCloseTo(Math.PI / 4);
  await page.reload();
  await expect(page.locator("[data-item-instance]")).toHaveCount(1);
  await page.locator("[data-item-instance]").click();
  await expect(page.getByLabel("Rotation (degrees)")).toHaveValue("45");
  const footprintBefore = await page
    .locator("[data-item-instance] rect")
    .evaluate((el) => ({
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
    }));
  expect(footprintBefore).toEqual({ width: "2.4", height: "0.95" });
  await expect(page.getByLabel(/Scale|Resize|Stretch/)).toHaveCount(0);
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  await expect(page.locator(".three-view canvas")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Placed color", exact: true })
    .selectOption({ label: "White" });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  const after = await (
    await page.request.get(`/api/scenes/${scene.id}`)
  ).json();
  expect({
    ...after.floors[0].itemInstances[0],
    variantId: saved.floors[0].itemInstances[0].variantId,
  }).toEqual(saved.floors[0].itemInstances[0]);
  expect(after.floors[0].itemInstances[0].variantId).toBe(
    adminItem.variants.find((v: { name: string }) => v.name === "White").id,
  );
  expect(await (await page.request.get(`/api/items/${itemId}`)).json()).toEqual(
    beforeCatalog,
  );
  await page.screenshot({
    path: "test-results/catalog-workspace.png",
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);
  expect(failedCatalogRequests).toEqual([
    { status: 400, path: "/api/admin/items" },
  ]);
  expect(mutations).toEqual({ calibrations: 1, colorCreates: 3, publishes: 1 });
});

test("editing a color preserves its override currency and replacing an unused model resumes dimensions", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().clearCookies();
  const headers = { "X-Habitat-Request": "1" };
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: {
          email: "admin@example.test",
          password: "Admin test passphrase 42!",
        },
      })
    ).ok(),
  ).toBe(true);
  const brands = await (
    await page.request.post("/api/admin/item-brands", {
      headers,
      data: { name: "Currency test brand" },
    })
  ).json();
  const product = await (
    await page.request.post("/api/admin/items", {
      headers,
      data: {
        name: "Currency and replacement test",
        brandId: brands.find(
          (b: { name: string }) => b.name === "Currency test brand",
        ).id,
        categoryId: "sofa",
        basePriceMinor: 10000,
        currency: "ILS",
        samePriceForAllColors: false,
      },
    })
  ).json();
  const path = `/api/admin/items/${product.id}`;
  const model = await (
    await page.request.post(`${path}/model`, {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "X-File-Name": "original.glb",
      },
      data: colorTargetGLB(),
    })
  ).json();
  expect(
    (
      await page.request.patch(`${path}/assets/${model.id}/calibration`, {
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
  ).toBe(true);
  expect(
    (
      await page.request.post(`${path}/color-targets`, {
        headers,
        data: { targets: [{ materialIndex: 0, nodeIndex: 0 }] },
      })
    ).ok(),
  ).toBe(true);
  const created = await (
    await page.request.post(`${path}/colors`, {
      headers,
      data: {
        name: "European Blue",
        status: "ACTIVE",
        baseColor: "#0000ff",
        sku: "EUR-BLUE",
        priceMinor: 12345,
        currency: "EUR",
      },
    })
  ).json();
  const colorId = created.defaultVariantId;
  await page.goto(`/admin/items/${product.id}`);
  await page
    .getByRole("button", { name: "5. Available colors", exact: true })
    .click();
  await page
    .locator(".color-card")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(
    page.getByLabel("Color price currency", { exact: true }),
  ).toHaveValue("EUR");
  await page
    .getByLabel("Color name", { exact: true })
    .fill("Renamed European Blue");
  await page.getByRole("button", { name: "Save color", exact: true }).click();
  await expect(
    page
      .locator(".color-card")
      .getByRole("heading", { name: "Renamed European Blue", exact: true }),
  ).toBeVisible();
  const edited = await (await page.request.get(path)).json();
  expect(edited.colors[0]).toMatchObject({
    id: colorId,
    sku: "EUR-BLUE",
    priceOverrideMinor: 12345,
    currencyOverride: "EUR",
  });
  await page.getByRole("button", { name: "2. 3D model", exact: true }).click();
  await page.getByLabel("Replace model").setInputFiles({
    name: "replacement.glb",
    mimeType: "model/gltf-binary",
    buffer: colorTargetGLB(),
  });
  await expect(page.getByText(/replacement.glb · Validated/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Dimensions & orientation",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Real width (cm)")).toHaveValue("");
  const replaced = await (await page.request.get(path)).json();
  expect(replaced.baseModelAssetId).not.toBe(model.id);
  expect(
    replaced.assets.filter((a: { type: string }) => a.type === "GLB_MODEL"),
  ).toHaveLength(1);
  expect(replaced.dimensions).toBeNull();
  expect(replaced.bindings).toHaveLength(0);
  expect(replaced.colors[0]).toMatchObject({
    id: colorId,
    sku: "EUR-BLUE",
    currencyOverride: "EUR",
  });
  expect(replaced.setup.nextRequiredStep).toBe("DIMENSIONS");
  expect(replaced.status).toBe("DRAFT");
  expect(errors).toEqual([]);
});
