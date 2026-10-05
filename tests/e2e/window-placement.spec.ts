import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "./fixtures";
import { sceneSchema, type HomeScene } from "@habitat/domain";
import { chain, detected, rectangle } from "../space-fixtures";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const log: string[] = [];
  errors.set(page, log);
  page.on("pageerror", (e) => log.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") log.push(m.text());
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function seed(page: Page, request: APIRequestContext, source: HomeScene) {
  const project = await (
    await request.post("/api/projects", {
      data: { name: "Window placement UX" },
    })
  ).json();
  const initial = sceneSchema.parse(
    await (
      await request.post(`/api/projects/${project.id}/scenes`, {
        data: { floorName: "Ground floor", elevation: 0 },
      })
    ).json(),
  );
  const response = await request.put(`/api/scenes/${initial.id}`, {
    data: {
      expectedRevision: initial.revision,
      scene: { ...initial, floors: source.floors, evidence: source.evidence },
      writerCapabilities: ["door-orientation-v1", "window-assembly-v1"],
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  await page.goto(`/projects/${project.id}/editor`);
  await expect(page.locator(".plan-svg")).toBeVisible();
  return async () =>
    sceneSchema.parse(
      await (await request.get(`/api/scenes/${initial.id}`)).json(),
    );
}
async function position(page: Page, x: number, y: number) {
  return page.locator(".plan-svg").evaluate(
    (svg, p) => {
      const q = new DOMPoint(p.x, p.y).matrixTransform(
        (svg as SVGSVGElement).getScreenCTM()!,
      );
      return { x: q.x, y: q.y };
    },
    { x, y },
  );
}
async function hover(page: Page, x: number, y: number) {
  const p = await position(page, x, y);
  await page.mouse.move(p.x, p.y);
}
async function click(page: Page, x: number, y: number) {
  const p = await position(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function settings(page: Page) {
  await page.getByLabel("Tool settings", { exact: true }).click();
}
async function activate(page: Page) {
  await page.getByRole("button", { name: "Add window", exact: true }).click();
}
const ghost = (page: Page) => page.locator("[data-opening-preview]");
async function expectPosition(page: Page, expected: number) {
  await expect
    .poll(async () => Number(await ghost(page).getAttribute("data-position")))
    .toBeCloseTo(expected, 2);
}
async function expectTransform(
  page: Page,
  x: number,
  y: number,
  angle: number,
) {
  const transform = await ghost(page)
    .locator("g")
    .first()
    .getAttribute("transform");
  const values = transform!
    .match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)!
    .map(Number);
  expect(values[0]).toBeCloseTo(x, 5);
  expect(values[1]).toBeCloseTo(y, 5);
  expect(values[2]).toBeCloseTo(angle, 5);
}
const confirm = (page: Page) =>
  page.getByRole("button", { name: "Confirm window", exact: true });
async function save(page: Page) {
  const revision = Number(
    await page.locator(".editor").getAttribute("data-scene-revision"),
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    String(revision + 1),
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
}

test("hover, fit, lock, sill/height, save/reload and space elevation changes preserve world geometry", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const source = detected(rectangle()),
    floor = source.floors[0];
  floor.rooms[0].name = "Living Room";
  floor.rooms[0].floorElevation = 0.45;
  const current = await seed(page, request, source);
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await activate(page);
  await expect(page.locator(".plan-svg")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByLabel("New window sill height")).toHaveValue("0.9");
  await expect(
    page.getByLabel("New window height", { exact: true }),
  ).toHaveValue("1.2");
  await expect(page.getByLabel("New window bottom elevation")).toHaveCount(0);
  await settings(page);
  await hover(page, 5, 0);
  await expect(ghost(page)).toHaveAttribute("data-placement", "hover");
  await expectPosition(page, 5);
  await expect(ghost(page)).toHaveAttribute("data-host-id", floor.walls[0].id);
  await hover(page, 6, 0.12);
  await expectPosition(page, 6);
  await expectTransform(page, 6, 0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-window-id]")).toHaveCount(0);
  expect((await current()).floors[0].windows).toHaveLength(0);
  await hover(page, 7.95, 0);
  await expectPosition(page, 6.8);
  await expect(ghost(page)).toHaveAttribute("data-adjusted", "true");
  await expect(ghost(page)).toHaveAttribute("data-valid", "true");
  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();

  await activate(page);
  await page.getByLabel("New opening width").fill("10");
  await settings(page);
  await hover(page, 5, 0);
  await expect(ghost(page)).toHaveAttribute("data-valid", "false");
  await expect(ghost(page).locator("rect").last()).toHaveAttribute(
    "stroke",
    "#be4848",
  );
  const hoveringPosition = await ghost(page).getAttribute("data-position");
  await click(page, 5, 0);
  await expect(ghost(page)).toHaveAttribute("data-position", hoveringPosition!);
  await settings(page);
  await expect(confirm(page)).toBeDisabled();
  await expect(page.locator(".window-placement-error")).toContainText(
    "beyond host wall",
  );
  await page.getByLabel("New opening width").fill("1.2");
  await settings(page);
  await click(page, 5, 0);
  await expect(ghost(page)).toHaveAttribute("data-placement", "fixed");
  await hover(page, 6, 0);
  await expectPosition(page, 5);
  await click(page, 8, 2);
  await expect(ghost(page)).toHaveAttribute("data-host-id", floor.walls[1].id);
  await click(page, 4, 0);
  await expectPosition(page, 4);
  await expect(page.locator("[data-window-id]")).toHaveCount(0);
  await settings(page);
  await page.getByLabel("New opening width").fill("2.40");
  await page.getByLabel("New window sill height").fill("0.90");
  await page.getByLabel("New window height", { exact: true }).fill("1.50");
  await expect(page.getByTestId("new-window-reference")).toHaveText(
    "Relative to: Space Living Room +0.45 m",
  );
  await expect(page.getByTestId("new-window-world-bottom")).toHaveText(
    "+1.35 m",
  );
  await expect(page.getByTestId("new-window-world-top")).toHaveText("+2.85 m");
  await page.getByLabel("New window height", { exact: true }).press("Enter");
  await expect(page.locator("[data-window-id]")).toHaveCount(0);
  await expect(confirm(page)).toBeEnabled();
  await page.screenshot({ path: "test-results/window-sill-placement.png" });
  await confirm(page).click();
  await expect(page.getByLabel("Sill Height (m)", { exact: true })).toHaveValue(
    "0.9",
  );
  await expect(
    page.getByLabel("Window Height (m)", { exact: true }),
  ).toHaveValue("1.5");
  await expect(page.getByLabel("Window bottom elevation (m)")).toHaveCount(0);
  // Existing inputs also give arithmetic feedback before committing.
  await page.getByLabel("Window Height (m)", { exact: true }).fill("1.4");
  await expect(page.getByTestId("window-world-top")).toHaveText("+2.75 m");
  await page.getByLabel("Window Height (m)", { exact: true }).fill("1.5");
  await page.getByLabel("Window Height (m)", { exact: true }).press("Enter");
  await save(page);
  const before = (await current()).floors[0].windows[0];
  expect(before.bottomElevation).toBeCloseTo(1.35);
  expect(before.topElevation).toBeCloseTo(2.85);
  expect(before).toMatchObject({
    verticalReference: "WORLD",
    sillHeight: null,
    height: null,
    width: 2.4,
  });
  await page.reload();
  await click(page, 5, 0);
  await expect(page.getByLabel("Sill Height (m)", { exact: true })).toHaveValue(
    "0.9",
  );
  await expect(
    page.getByLabel("Window Height (m)", { exact: true }),
  ).toHaveValue("1.5");
  await click(page, 5, 2);
  await page.getByLabel("Space floor elevation", { exact: true }).fill("0.55");
  await page
    .getByLabel("Space floor elevation", { exact: true })
    .press("Enter");
  await click(page, 5, 0);
  await expect(page.getByLabel("Sill Height (m)", { exact: true })).toHaveValue(
    "0.8",
  );
  await expect(page.getByTestId("window-world-bottom")).toHaveText("+1.35 m");
  await expect(page.getByTestId("window-world-top")).toHaveText("+2.85 m");
  await save(page);
  expect((await current()).floors[0].windows[0]).toEqual(before);

  // Collision uses the same validator and remains visible on the ghost.
  await activate(page);
  await settings(page);
  await hover(page, 5, 0);
  await expect(ghost(page)).toHaveAttribute("data-valid", "false");
  await click(page, 5, 0);
  await settings(page);
  await expect(page.locator(".window-placement-error")).toContainText(
    "overlaps",
  );
  await expect(confirm(page)).toBeDisabled();
  await page.getByLabel("New opening width").focus();
  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  expect((await current()).floors[0].windows).toHaveLength(1);
});

test("angled host projection stays constrained and Enter confirms only a fixed candidate", async ({
  page,
  request,
}) => {
  const source = chain([
    [0, 0],
    [6, 8],
  ]);
  const current = await seed(page, request, source);
  await activate(page);
  await settings(page);
  await hover(page, -0.06, -0.08);
  await expectPosition(page, 0);
  await expect(ghost(page)).toHaveAttribute("data-adjusted", "true");
  await hover(page, 3.08, 3.94);
  await expect
    .poll(async () => Number(await ghost(page).getAttribute("data-position")))
    .toBeCloseTo(5);
  await expectTransform(page, 3, 4, 53.13010235415598);
  await hover(page, 4.2, 5.6);
  await expect
    .poll(async () => Number(await ghost(page).getAttribute("data-position")))
    .toBeCloseTo(7);
  await click(page, 4.2, 5.6);
  await hover(page, 3, 4);
  await expect
    .poll(async () => Number(await ghost(page).getAttribute("data-position")))
    .toBeCloseTo(7);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("Enter");
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator("[data-window-id]")).toHaveCount(1);
  await save(page);
  expect((await current()).floors[0].windows[0].positionAlongWall).toBeCloseTo(
    7,
  );
});

test("elevated Floor fallback converts relative inputs without a space", async ({
  page,
  request,
}) => {
  const source = chain([
    [0, 0],
    [8, 0],
  ]);
  source.floors[0].elevation = 3;
  const current = await seed(page, request, source);
  await activate(page);
  await click(page, 6, 0);
  await expect(page.getByTestId("new-window-reference")).toContainText("Floor");
  await expect(page.getByTestId("new-window-reference")).toContainText(
    "+3.00 m",
  );
  await expect(page.getByTestId("new-window-world-bottom")).toHaveText(
    "+3.90 m",
  );
  await expect(page.getByTestId("new-window-world-top")).toHaveText("+5.10 m");
  await confirm(page).click();
  await expect(page.getByLabel("Sill Height (m)", { exact: true })).toHaveValue(
    "0.9",
  );
  await save(page);
  const w = (await current()).floors[0].windows[0];
  expect(w.bottomElevation).toBeCloseTo(3.9);
  expect(w.topElevation).toBeCloseTo(5.1);
});

test("unknown reference requires explicit world elevations without assuming zero", async ({
  page,
  request,
}) => {
  const source = chain([
    [0, 0],
    [8, 0],
  ]);
  source.floors[0].elevation = null;
  const current = await seed(page, request, source);
  await activate(page);
  await click(page, 6, 0);
  await expect(page.locator(".window-placement")).toContainText(
    "Floor/Space elevation is unknown",
  );
  await expect(page.getByTestId("new-window-world-bottom")).toHaveText(
    "Unknown",
  );
  await expect(page.getByTestId("new-window-world-top")).toHaveText("Unknown");
  await expect(page.getByLabel("New window bottom elevation")).toHaveValue("");
  await expect(confirm(page)).toBeDisabled();
  await expect(ghost(page)).toHaveAttribute("data-valid", "false");
  await page.getByLabel("New window bottom elevation").fill("4.2");
  await page.getByLabel("New window top elevation").fill("5.4");
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expect(page.getByLabel("Sill Height (m)", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Window bottom elevation (m)")).toHaveValue(
    "4.2",
  );
  await save(page);
  await page.reload();
  await click(page, 6.5, 0);
  await expect(page.getByLabel("Window bottom elevation (m)")).toHaveValue(
    "4.2",
  );
  expect((await current()).floors[0].windows[0]).toMatchObject({
    bottomElevation: 4.2,
    topElevation: 5.4,
    height: null,
    sillHeight: null,
  });
});

test("advanced world editing remains secondary and inspection does not rewrite existing geometry", async ({
  page,
  request,
}) => {
  const source = chain([
    [0, 0],
    [8, 0],
  ]);
  const current = await seed(page, request, source);
  await activate(page);
  await click(page, 6, 0);
  await page
    .locator(".window-placement summary")
    .filter({ hasText: "Advanced placement" })
    .click();
  await page.getByLabel("Edit new window world elevations").check();
  await expect(page.getByLabel("New window bottom elevation")).toHaveValue(
    "0.9",
  );
  await page.getByLabel("New window top elevation").fill("2.4");
  await confirm(page).click();
  await save(page);
  const original = (await current()).floors[0].windows[0];
  await page
    .locator(".window-fields summary")
    .filter({ hasText: "Advanced world elevations" })
    .click();
  await page.getByLabel("Edit window world elevations").check();
  await page.getByLabel("Window bottom elevation (m)").focus();
  await page.getByLabel("Window bottom elevation (m)").press("Tab");
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  expect((await current()).floors[0].windows[0]).toEqual(original);
  await page.getByLabel("Window top elevation (m)").fill("2.5");
  await page.getByLabel("Window top elevation (m)").press("Enter");
  await page.getByLabel("Edit window world elevations").uncheck();
  await expect(page.getByLabel("Sill Height (m)", { exact: true })).toHaveValue(
    "0.9",
  );
  await expect(
    page.getByLabel("Window Height (m)", { exact: true }),
  ).toHaveValue("1.6");
  await save(page);
  expect((await current()).floors[0].windows[0]).toMatchObject({
    bottomElevation: 0.9,
    topElevation: 2.5,
    height: null,
    sillHeight: null,
  });
});
