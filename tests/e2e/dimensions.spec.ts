import { test, expect } from "./fixtures";
import { testGLB } from "../glb-fixture";
const headers = { "X-Habitat-Request": "1" };
test.afterEach(async ({ request }) => {
  await request.patch("/api/account/display", {
    data: { lengthDisplayUnit: "M" },
  });
});
test("verified calibration uses canonical metres, survives live CM/M changes, and remains camera independent", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.context().clearCookies();
  await page.request.post("/api/auth/login", {
    headers,
    data: {
      email: "admin@example.test",
      password: "Admin test passphrase 42!",
    },
  });
  await page.request.patch("/api/account/display", {
    headers,
    data: { lengthDisplayUnit: "CM" },
  });
  const brands = await (
    await page.request.post("/api/admin/item-brands", {
      headers,
      data: { name: `Dimensions ${Date.now()}` },
    })
  ).json();
  const item = await (
    await page.request.post("/api/admin/items", {
      headers,
      data: {
        name: "Dimension proof sofa",
        brandId: brands.at(-1).id,
        categoryId: "sofa",
      },
    })
  ).json();
  const path = `/api/admin/items/${item.id}`;
  const bytes = testGLB((g) => {
    for (const n of g.nodes as { scale?: number[] }[]) {
      const s = n.scale ?? [1, 1, 1];
      n.scale = [
        (s[0] * 0.7837) / 2.4,
        (s[1] * 0.6017) / 0.82,
        (s[2] * 2) / 0.95,
      ];
    }
  });
  const model = await (
    await page.request.post(`${path}/model`, {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "X-File-Name": "sofa.glb",
      },
      data: bytes,
    })
  ).json();
  await page.goto(`/admin/items/${item.id}`);
  await expect(
    page.getByRole("heading", { name: "Raw GLB bounds", exact: true }),
  ).toBeVisible();
  const raw = page.getByText(/model units \(width × depth × height\)/);
  const rawBefore = await raw.textContent();
  await page
    .getByRole("combobox", { name: "Product orientation", exact: true })
    .selectOption("90");
  await expect(page.getByText(/Oriented model axes/)).toContainText(
    "width 2.0000, depth 0.7837",
  );
  await expect(raw).toHaveText(rawBefore!);
  for (const [k, v] of [
    ["width", "2"],
    ["depth", ".7837"],
    ["height", ".6017"],
  ])
    await page.getByLabel(`Real ${k} (cm)`).fill(v);
  await expect(page.getByText(/ITEM_DIMENSIONS_IMPLAUSIBLE/)).toBeVisible();
  await expect(page.getByText(/Suggested interpretation:/)).toContainText(
    "200 × 78.37 × 60.17 cm",
  );
  await expect(
    page.getByRole("button", { name: "Confirm dimensions", exact: true }),
  ).toBeDisabled();
  for (const [k, v] of [
    ["width", "200"],
    ["depth", "78.37"],
    ["height", "60.17"],
  ])
    await page.getByLabel(`Real ${k} (cm)`).fill(v);
  await page
    .getByRole("combobox", { name: "Dimension source", exact: true })
    .selectOption("TECHNICAL_SHEET");
  await page
    .getByRole("checkbox", {
      name: "I have verified these dimensions against the real product.",
    })
    .check();
  await expect(
    page.getByText("✓ Rendered calibrated size matches product dimensions", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Real width (cm)", { exact: true }).fill("");
  await expect(
    page.getByRole("button", { name: "Confirm dimensions", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", {
      name: "I have verified these dimensions against the real product.",
    }),
  ).not.toBeChecked();
  await page.getByLabel("Real width (cm)", { exact: true }).fill("200");
  await page
    .getByRole("checkbox", {
      name: "I have verified these dimensions against the real product.",
    })
    .check();
  await expect(
    page.getByRole("button", { name: "Confirm dimensions", exact: true }),
  ).toBeEnabled();
  const posted = page.waitForRequest(
    (r) => r.url().endsWith("/calibration") && r.method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Confirm dimensions", exact: true })
    .click();
  expect((await posted).postDataJSON()).toMatchObject({
    width: 2,
    depth: expect.closeTo(0.7837, 12),
    height: expect.closeTo(0.6017, 12),
    orientation: 90,
    dimensionsVerified: true,
    dimensionSource: "TECHNICAL_SHEET",
  });
  await expect(
    page.getByText("Confirmed real product size:", { exact: false }),
  ).toContainText("200 × 78.37 × 60.17 cm");
  await expect(
    page.getByText("✓ Automatically generated from 3D model", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const before = await (await page.request.get(path)).json();
  expect(before.calibrationStatus).toBe("VERIFIED");
  expect(before.dimensionVerification.verifiedByUserId).toBeTruthy();
  const thumbnail = before.thumbnailAssetId;
  // A settings change in another tab updates this mounted editor via the account context.
  const settings = await page.context().newPage();
  await settings.goto("/settings/display");
  await settings.getByRole("radio", { name: "Meters", exact: true }).check();
  await settings
    .getByRole("button", { name: "Save display preference" })
    .click();
  await expect(settings.getByText("Display preference saved.")).toBeVisible();
  await expect(page.getByLabel("Real width (m)", { exact: true })).toHaveValue(
    "2",
  );
  await expect(
    page.getByText("Confirmed real product size:", { exact: false }),
  ).toContainText("2.00 × 0.7837 × 0.6017 m");
  await settings.close();
  await page.reload();
  await page
    .getByRole("button", { name: /3.*Dimensions & orientation/ })
    .click();
  await expect(page.getByLabel("Real depth (m)", { exact: true })).toHaveValue(
    "0.7837",
  );
  await expect(page.locator(".item-preview")).toHaveAttribute(
    "data-world-bounds",
    /.+/,
  );
  const boundString = await page
    .locator(".item-preview")
    .getAttribute("data-world-bounds");
  const bounds = JSON.parse(boundString!);
  expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(2, 5);
  expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(0.7837, 5);
  expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(0.6017, 5);
  const canvas = page.locator(".item-preview canvas"),
    rect = await canvas.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect!.x + rect!.width * 0.7,
    rect!.y + rect!.height * 0.7,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.mouse.wheel(0, 200);
  await page.setViewportSize({ width: 1200, height: 850 });
  await expect(page.locator(".item-preview")).toHaveAttribute(
    "data-world-bounds",
    boundString!,
  );
  const after = await (await page.request.get(path)).json();
  for (const key of [
    "width",
    "depth",
    "height",
    "dimensionVerification",
    "thumbnailAssetId",
  ])
    expect(after[key]).toEqual(before[key]);
  expect(after.thumbnailAssetId).toBe(thumbnail);
  expect(
    after.assets.find((a: { id: string }) => a.id === model.id).inspection,
  ).toEqual(
    before.assets.find((a: { id: string }) => a.id === model.id).inspection,
  );
  // Restore admin preference for the other independent workflows.
  await page.request.patch("/api/account/display", {
    headers,
    data: { lengthDisplayUnit: "CM" },
  });
});

test("CM workspace lengths edit in centimetres while preference-only changes preserve canonical scene geometry", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const { rectangle } = await import("../space-fixtures");
  const source = rectangle();
  const project = await (
    await request.post("/api/projects", {
      data: { name: "Unit preference geometry" },
    })
  ).json();
  const initial = await (
    await request.post(`/api/projects/${project.id}/scenes`, {
      data: { floorName: "Ground", elevation: 0 },
    })
  ).json();
  const saved = await request.put(`/api/scenes/${initial.id}`, {
    data: {
      expectedRevision: initial.revision,
      scene: { ...initial, floors: source.floors, evidence: source.evidence },
      writerCapabilities: ["door-orientation-v1", "window-assembly-v1"],
    },
  });
  expect(saved.ok()).toBe(true);
  const before = await saved.json();
  await request.patch("/api/account/display", {
    data: { lengthDisplayUnit: "CM" },
  });
  await page.goto(`/projects/${project.id}/editor`);
  await expect(page.locator(".plan-svg")).toBeVisible();
  const point = await page.locator(".plan-svg").evaluate((svg) => {
    const p = new DOMPoint(4, 0).matrixTransform(
      (svg as SVGSVGElement).getScreenCTM()!,
    );
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByLabel("Wall length (cm)", { exact: true }),
  ).toHaveValue("800");
  await page.getByLabel("Wall length (cm)", { exact: true }).focus();
  await page.getByLabel("Wall length (cm)", { exact: true }).press("Tab");
  await page.getByLabel("Move wall X", { exact: true }).fill("");
  await page
    .getByLabel("Move wall X", { exact: true })
    .pressSequentially("-100");
  await expect(page.getByLabel("Move wall X", { exact: true })).toHaveValue(
    "-100",
  );
  const settings = await page.context().newPage();
  await settings.goto("/settings/display");
  await settings.getByRole("radio", { name: "Meters", exact: true }).check();
  await settings
    .getByRole("button", { name: "Save display preference" })
    .click();
  await expect(settings.getByText("Display preference saved.")).toBeVisible();
  await expect(page.getByLabel("Wall length (m)", { exact: true })).toHaveValue(
    "8",
  );
  await expect(page.getByLabel("Move wall X", { exact: true })).toHaveValue(
    "-1",
  );
  expect(
    (await (await request.get(`/api/scenes/${initial.id}`)).json()).floors,
  ).toEqual(before.floors);
  await settings
    .getByRole("radio", { name: "Centimeters", exact: true })
    .check();
  await settings
    .getByRole("button", { name: "Save display preference" })
    .click();
  await expect(
    page.getByLabel("Wall length (cm)", { exact: true }),
  ).toHaveValue("800");
  await settings.close();
  await page.getByLabel("Wall length (cm)", { exact: true }).fill("900");
  await expect(page.getByLabel("Move wall X", { exact: true })).toHaveValue(
    "-100",
  );
  await page.getByLabel("Wall length (cm)", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".saved-state")).toHaveText("Saved");
  const after = await (await request.get(`/api/scenes/${initial.id}`)).json();
  const wall = after.floors[0].walls.find(
    (w: { id: string }) => w.id === source.floors[0].walls[0].id,
  );
  expect(
    Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y),
  ).toBeCloseTo(9);
  await request.patch("/api/account/display", {
    data: { lengthDisplayUnit: "M" },
  });
});
