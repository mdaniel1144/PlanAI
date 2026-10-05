import { verifiedDimensions } from "../dimension-fixture";
import { writeFileSync } from "node:fs";
import { test, expect, type Page } from "./fixtures";
import type { Item } from "@habitat/domain";
import sharp from "../../server/node_modules/sharp/dist/index.mjs";
import { testGLB } from "../glb-fixture";
const headers = { "X-Habitat-Request": "1" };
async function setup(page: Page) {
  await page.context().clearCookies();
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
      data: { name: `Thumbnail ${Date.now()}` },
    })
  ).json();
  return brands.at(-1).id as string;
}
async function product(
  page: Page,
  brandId: string,
  name: string,
  width = 2.4,
  height = 0.82,
  depth = 0.95,
) {
  const response = await page.request.post("/api/admin/items", {
    headers,
    data: { name, brandId, categoryId: "sofa" },
  });
  expect(response.status()).toBe(201);
  const item = await response.json();
  const bytes = testGLB((g) => {
    for (const node of g.nodes as { scale?: number[] }[]) {
      const s = node.scale ?? [1, 1, 1];
      node.scale = [
        (s[0] * width) / 2.4,
        (s[1] * height) / 0.82,
        (s[2] * depth) / 0.95,
      ];
    }
  });
  const asset = await (
    await page.request.post(`/api/admin/items/${item.id}/model`, {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "X-File-Name": "fixture.glb",
      },
      data: bytes,
    })
  ).json();
  const calibrated = await page.request.patch(
    `/api/admin/items/${item.id}/assets/${asset.id}/calibration`,
    {
      headers,
      data: verifiedDimensions({
        width,
        depth,
        height,
        orientation: 0,
        confirmed: true,
      }),
    },
  );
  expect(calibrated.status()).toBe(200);
  return (await calibrated.json()) as Item;
}
async function render(page: Page, item: Item) {
  return page.evaluate(async (item) => {
    const path = "/src/features/items/generateItemThumbnail.ts";
    const { generateItemThumbnail, thumbnailResources } = await import(
      /* @vite-ignore */ path
    );
    const blob = await generateItemThumbnail(item);
    return {
      bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      type: blob.type,
      active: thumbnailResources.active,
    };
  }, item);
}
async function assertFramed(bytes: number[], name = "thumbnail") {
  writeFileSync(test.info().outputPath(`${name}.webp`), Buffer.from(bytes));
  const data = Buffer.from(bytes),
    metadata = await sharp(data).metadata();
  expect(metadata.width).toBe(512);
  expect(metadata.height).toBe(512);
  expect(metadata.format).toBe("webp");
  const { data: pixels, info } = await sharp(data)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = Array.from(pixels.subarray(0, 3));
  let minX = 512,
    minY = 512,
    maxX = 0,
    maxY = 0,
    count = 0;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * info.channels;
      if (background.some((b, c) => Math.abs(pixels[i + c] - b) > 7)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        count++;
      }
    }
  expect(count).toBeGreaterThan(100);
  expect(minX).toBeGreaterThan(5);
  expect(minY).toBeGreaterThan(5);
  expect(maxX).toBeLessThan(507);
  expect(maxY).toBeLessThan(507);
  expect(Math.max(maxX - minX, maxY - minY)).toBeGreaterThan(240);
  expect(Math.abs((minX + maxX) / 2 - 256)).toBeLessThan(85);
  expect(Math.abs((minY + maxY) / 2 - 256)).toBeLessThan(85);
  return pixels;
}
test("controlled square renders fit varied models and preserve calibration and material isolation", async ({
  page,
}) => {
  test.setTimeout(120000);
  const brand = await setup(page);
  await page.goto("/projects");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [name, w, h, d] of [
    ["Wide", 12, 1, 1],
    ["Tall", 0.7, 8, 0.5],
    ["Chair", 0.45, 1.1, 0.5],
    ["Table", 3, 0.8, 2],
    ["Door", 0.9, 2.1, 0.04],
  ] as const) {
    const item = await product(page, brand, name, w, h, d);
    const output = await render(page, item);
    expect(output.active).toBe(0);
    await assertFramed(output.bytes, name);
  }
  let item = await product(page, brand, "Color proof");
  const path = `/api/admin/items/${item.id}`;
  await page.request.post(`${path}/color-targets`, {
    headers,
    data: { targets: [{ materialIndex: 0, nodeIndex: 0 }] },
  });
  await page.request.post(`${path}/colors`, {
    headers,
    data: { name: "Blue", baseColor: "#0000ff", status: "ACTIVE" },
  });
  item = await (
    await page.request.post(`${path}/colors`, {
      headers,
      data: { name: "White", baseColor: "#ffffff", status: "ACTIVE" },
    })
  ).json();
  const proof = await page.evaluate(async (item) => {
    const cachePath = "/src/features/items/model-cache.ts",
      renderPath = "/src/features/items/generateItemThumbnail.ts";
    const cache = await import(/* @vite-ignore */ cachePath),
      render = await import(/* @vite-ignore */ renderPath);
    const source = await cache.loadModel(item.baseModelAssetId),
      white = cache.cloneModel(source),
      whiteColor = item.colors.find((c) => c.name === "White")!;
    await cache.applyVariant(white, item, whiteColor);
    const baseBefore = source.scene
      .getObjectByName("Fabric")
      .material.color.getHexString();
    try {
      const [blueImage, whiteImage] = await Promise.all([
        render.generateItemThumbnail(item),
        render.generateItemThumbnail({
          ...item,
          defaultVariantId: whiteColor.id,
        }),
      ]);
      return {
        blue: Array.from(new Uint8Array(await blueImage.arrayBuffer())),
        white: Array.from(new Uint8Array(await whiteImage.arrayBuffer())),
        whiteUnchanged:
          white.scene
            .getObjectByName("Fabric")
            .material.color.getHexString() === "ffffff",
        sourceUnchanged:
          baseBefore ===
          source.scene.getObjectByName("Fabric").material.color.getHexString(),
        active: render.thumbnailResources.active,
      };
    } finally {
      white.dispose();
    }
  }, item);
  const blue = await assertFramed(proof.blue, "Blue"),
    white = await assertFramed(proof.white, "White");
  expect(proof.whiteUnchanged).toBe(true);
  expect(proof.sourceUnchanged).toBe(true);
  expect(proof.active).toBe(0);
  expect(blue.equals(white)).toBe(false);
  expect(
    Array.from(blue).some(
      (v, i) =>
        i % 3 === 2 && v > 120 && v > blue[i - 2] + 60 && v > blue[i - 1] + 60,
    ),
  ).toBe(true);
  const rotated = await (
    await page.request.patch(
      `${path}/assets/${item.baseModelAssetId}/calibration`,
      {
        headers,
        data: verifiedDimensions({
          width: 0.95,
          depth: 2.4,
          height: 0.82,
          orientation: 90,
          confirmed: true,
        }),
      },
    )
  ).json();
  const turned = await render(page, rotated);
  expect((await assertFramed(turned.bytes, "Rotated")).equals(blue)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test("texture capture waits for readiness; failed WebGL regeneration retains the last image and retries", async ({
  page,
}) => {
  test.setTimeout(90000);
  const brand = await setup(page);
  let item = await product(page, brand, "Texture and retry");
  const path = `/api/admin/items/${item.id}`;
  await page.request.post(`${path}/color-targets`, {
    headers,
    data: { targets: [{ materialIndex: 0, nodeIndex: 0 }] },
  });
  const textureBytes = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#00ff00" },
  })
    .png()
    .toBuffer();
  const texture = await (
    await page.request.post(`${path}/textures`, {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "X-File-Name": "green.png",
      },
      data: textureBytes,
    })
  ).json();
  item = await (
    await page.request.post(`${path}/colors`, {
      headers,
      data: {
        name: "Textured",
        baseColor: "#ffffff",
        textureAssetId: texture.id,
        status: "ACTIVE",
      },
    })
  ).json();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let textureRequested = false;
  await page.route(`**/api/item-assets/${texture.id}`, async (route) => {
    textureRequested = true;
    await gate;
    await route.continue();
  });
  let uploads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/generated-thumbnail")) uploads++;
  });
  await page.goto(`/admin/items/${item.id}`);
  await expect.poll(() => textureRequested).toBe(true);
  expect(uploads).toBe(0);
  await expect(
    page.getByText("Generating thumbnail…", { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("✓ Automatically generated from 3D model", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const original = await page
    .getByAltText("Product image", { exact: true })
    .getAttribute("src");
  const image = await page.request.get(original!);
  const pixels = await assertFramed(Array.from(await image.body()));
  expect(
    Array.from(pixels).some(
      (v, i) =>
        i % 3 === 1 &&
        v > 120 &&
        v > pixels[i - 1] + 60 &&
        v > pixels[i + 1] + 60,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(window, "restoreThumbnailContext", {
      value: () => {
        HTMLCanvasElement.prototype.getContext = original;
      },
      configurable: true,
    });
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page
    .getByRole("button", { name: "Regenerate thumbnail", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Thumbnail could not be generated from the 3D model.",
  );
  await expect(
    page.getByAltText("Product image", { exact: true }),
  ).toHaveAttribute("src", original!);
  expect((await (await page.request.get(path)).json()).thumbnailAssetId).toBe(
    original!.split("/").at(-1),
  );
  await page.evaluate(() => {
    (
      window as unknown as { restoreThumbnailContext: () => void }
    ).restoreThumbnailContext();
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("✓ Thumbnail updated", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByAltText("Product image", { exact: true }),
  ).not.toHaveAttribute("src", original!);
  const beforeEdit = await page
    .getByAltText("Product image", { exact: true })
    .getAttribute("src");
  // Another admin edits the default while this browser is capturing the old color.
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let uploadWaiting = false;
  await page.route(`**${path}/generated-thumbnail`, async (route) => {
    if (!uploadWaiting) {
      uploadWaiting = true;
      await uploadGate;
    }
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Regenerate thumbnail", exact: true })
    .click();
  await expect.poll(() => uploadWaiting).toBe(true);
  const edited = await page.request.patch(
    `${path}/colors/${item.defaultVariantId}`,
    {
      headers,
      data: { baseColor: "#0000ff", textureAssetId: null },
    },
  );
  expect(edited.status()).toBe(200);
  const staleResponse = page.waitForResponse(
    (r) => r.url().endsWith("/generated-thumbnail") && r.status() === 409,
  );
  releaseUpload();
  await staleResponse;
  await expect(
    page.getByAltText("Product image", { exact: true }),
  ).not.toHaveAttribute("src", beforeEdit!, { timeout: 20000 });
  const fresh = (await (await page.request.get(path)).json()) as Item;
  expect(fresh.thumbnailGeneration?.current).toBe(true);
  expect(fresh.baseModelAssetId).toBe(item.baseModelAssetId);
  expect(fresh.assets.filter((a) => a.type === "GLB_MODEL")).toHaveLength(1);
  const editedImage = await page.request.get(
    `/api/item-assets/${fresh.thumbnailAssetId}`,
  );
  const editedPixels = await assertFramed(
    Array.from(await editedImage.body()),
    "EditedBlue",
  );
  expect(
    Array.from(editedPixels).some(
      (v, i) =>
        i % 3 === 2 &&
        v > 120 &&
        v > editedPixels[i - 2] + 60 &&
        v > editedPixels[i - 1] + 60,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(async () => {
      const path = "/src/features/items/generateItemThumbnail.ts";
      return (await import(/* @vite-ignore */ path)).thumbnailResources.active;
    }),
  ).toBe(0);
});
