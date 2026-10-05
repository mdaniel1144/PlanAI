import { test, expect } from "./fixtures";
const projectId = "00000000-0000-4000-8000-000000000001";
const base = `/projects/${projectId}`;
test("canonical editor: selection, view options, 3D, split and saved properties", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/editor`);
  await expect(
    page.getByRole("heading", { name: "Courtyard residence" }),
  ).toBeVisible();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await expect(page.locator(".global-header .editor-titlebar")).toBeVisible();
  await expect(page.locator(".editor > .editor-titlebar")).toHaveCount(0);
  await expect(
    page.locator(".header-end > span, .header-end .avatar"),
  ).toHaveCount(0);
  await expect(page.locator(".properties-heading")).toHaveText("Properties");
  await expect(
    page.locator(".properties-panel").getByText("Evidence", { exact: true }),
  ).toHaveCount(0);

  await page
    .locator(".room-label")
    .getByText("Bedroom 1", { exact: true })
    .click();
  await expect(page.locator(".entity-heading h2")).toHaveText("Bedroom 1");
  await expect(
    page.locator(
      ".layers-panel, .canvas-bottom, .drawing-options, .editor-status",
    ),
  ).toHaveCount(0);
  await page.locator(".view-options > summary").click();
  await expect(
    page.getByRole("region", { name: "Editor status" }),
  ).toBeVisible();
  await page.getByLabel("Show grid", { exact: true }).uncheck();
  await expect(page.locator('[fill="url(#architectural-grid)"]')).toHaveCount(
    0,
  );
  await expect(page.locator(".canvas-stage")).toHaveCSS(
    "background-image",
    "none",
  );
  await page.getByLabel("Show grid", { exact: true }).check();
  await page.getByLabel("Grid spacing").selectOption("0.5");
  await expect(page.locator("#architectural-grid")).toHaveAttribute(
    "width",
    "0.5",
  );
  await page.getByLabel("Room labels", { exact: true }).uncheck();
  await expect(page.locator(".room-label")).toHaveCount(0);
  await page.getByLabel("Room labels", { exact: true }).check();
  await page.locator(".view-options > summary").click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".zoom-controls")).toContainText("110%");
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".plan-svg")).toHaveCount(0);
  await page.waitForTimeout(1000);
  const pixels = await page.locator("canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    return gl
      ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }
      : null;
  });
  expect(pixels?.width).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/editor-3d.png" });
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".plan-svg")).toBeVisible();
  await page.getByRole("button", { name: "2D plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit properties", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Guest bedroom");
  await page
    .getByRole("button", { name: "Apply to draft", exact: true })
    .click();
  await expect(page.locator(".entity-heading h2")).toHaveText("Guest bedroom");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "2",
  );
  await page.reload();
  await page
    .locator(".room-label")
    .getByText("Guest bedroom", { exact: true })
    .click();
  await expect(page.locator(".entity-heading h2")).toHaveText("Guest bedroom");
  await page.goto(`${base}/export`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download scene JSON" }).click();
  expect((await download).suggestedFilename()).toBe("habitat-scene.json");
  await page.goto(`${base}/review`);
  await expect(page.locator("tbody tr")).toHaveCount(42);
  await page.getByRole("button", { name: "doors", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  expect(errors).toEqual([]);
});
test("new projects start directly in the drawing editor and removed pages are unavailable", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Drawing project");
  await expect(page.getByLabel("Start with")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/editor$/);
  await page
    .getByRole("button", { name: "Create empty floor", exact: true })
    .click();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Version history", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Source plans", exact: true }),
  ).toHaveCount(0);
  for (const route of ["upload", "versions"]) {
    await page.goto(`${base}/${route}`);
    await expect(
      page.getByRole("heading", { name: "This page isn't here" }),
    ).toBeVisible();
  }
});
test("editor fits a laptop viewport without document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${base}/editor`);
  await expect(page.locator(".plan-svg")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/editor-laptop.png" });
});
