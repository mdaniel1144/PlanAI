import { test, expect, type Page } from "./fixtures";
import { sceneSchema } from "@habitat/domain";
async function clickPlan(page: Page, x: number, y: number) {
  const p = await page.locator(".plan-svg").evaluate(
    (svg, p) => {
      const q = new DOMPoint(p.x, p.y).matrixTransform(
        (svg as SVGSVGElement).getScreenCTM()!,
      );
      return { x: q.x, y: q.y };
    },
    { x, y },
  );
  await page.mouse.click(p.x, p.y);
}
async function field(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel(label, { exact: true }).press("Enter");
}
test("automatic Spaces → semantics → levels → split → save/reload → 3D → merge → open → current state", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Automatic space home");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByLabel("Floor elevation", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Create empty floor", exact: true })
    .click();
  await page.getByRole("button", { name: "Draw wall", exact: true }).click();
  for (const [x, y] of [
    [1, 1],
    [9, 1],
    [9, 5],
    [1, 5],
    [1, 1],
  ])
    await clickPlan(page, x, y);
  await page.keyboard.press("Escape");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-space-count",
    "1",
  );
  await expect(
    page.getByRole("button", { name: "Create room", exact: true }),
  ).toHaveCount(0);
  const original = JSON.parse(
    (await page.locator(".plan-svg").getAttribute("data-space-levels"))!,
  )[0].id;
  await clickPlan(page, 3, 3);
  await expect(
    page.getByLabel("Space floor elevation", { exact: true }),
  ).toHaveValue("0");
  await field(page, "Space name", "Living Room");
  await page.getByLabel("Space type").selectOption("living_room");
  await field(page, "Space floor elevation", "0");
  await field(page, "Space ceiling elevation", "3");
  await expect(page.getByTestId("space-clear-height")).toHaveText("3.00 m");
  await page.getByRole("button", { name: "Draw wall", exact: true }).click();
  await clickPlan(page, 6, 1);
  await clickPlan(page, 6, 5);
  await page.keyboard.press("Escape");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-space-count",
    "2",
  );
  expect(
    JSON.parse(
      (await page.locator(".plan-svg").getAttribute("data-space-levels"))!,
    ).some((r: { id: string }) => r.id === original),
  ).toBe(true);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-space-count",
    "1",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-space-count",
    "2",
  );
  await clickPlan(page, 7.5, 3);
  await field(page, "Space name", "Dining");
  await page.getByLabel("Space type").selectOption("dining");
  await field(page, "Space floor elevation", ".45");
  await field(page, "Space ceiling elevation", "3.2");
  await expect(page.getByTestId("space-clear-height")).toHaveText("2.75 m");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "2",
  );
  const pid = page.url().split("/projects/")[1].split("/")[0],
    rows = await (await request.get(`/api/projects/${pid}/scenes`)).json(),
    sid = rows[0].id;
  const current = async () =>
    sceneSchema.parse(await (await request.get(`/api/scenes/${sid}`)).json());
  const saved = await current();
  expect(saved.floors[0].rooms.find((r) => r.id === original)).toMatchObject({
    name: "Living Room",
    floorElevation: 0,
  });
  expect(saved.floors[0].rooms.find((r) => r.name === "Dining")).toMatchObject({
    floorElevation: 0.45,
    ceilingElevation: 3.2,
  });
  await page.reload();
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-space-count",
    "2",
  );
  const levels = await page
    .locator(".plan-svg")
    .getAttribute("data-space-levels");
  await clickPlan(page, 7.5, 3);
  const selected = saved.floors[0].rooms.find((r) => r.name === "Dining")!.id;
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-space-levels",
    levels!,
  );
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-selected-id",
    selected,
  );
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-space-surfaces",
    JSON.stringify(
      saved.floors[0].rooms.map((r) => ({ id: r.id, y: r.floorElevation })),
    ),
  );
  await page.screenshot({ path: "test-results/space-floor-levels.png" });
  await page.getByRole("button", { name: "2D plan", exact: true }).click();
  await clickPlan(page, 6, 3);
  await page.keyboard.press("Delete");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-space-count",
    "1",
  );
  await clickPlan(page, 3, 3);
  await expect(page.getByLabel("Space name", { exact: true })).toHaveValue(
    "Living Room",
  );
  const walls = Number(
    await page.locator(".plan-svg").getAttribute("data-wall-count"),
  );
  await clickPlan(page, 3, 1);
  await page.keyboard.press("Delete");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    String(walls - 1),
  );
  await expect(page.locator(".space-open-edge")).toHaveCount(1);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "3",
  );
  await page.reload();
  await expect(page.locator(".space-open-edge")).toHaveCount(1);
  const final = await current();
  expect(final.floors[0].rooms).toHaveLength(1);
  expect(["OPEN", "PARTIALLY_OPEN"]).toContain(
    final.floors[0].rooms[0].enclosureStatus,
  );
  expect(final.floors[0].walls).toHaveLength(walls - 1);
  expect(final.floors[0].rooms[0].id).toBe(original);
  expect((await request.get(`/api/scenes/${sid}/versions`)).status()).toBe(404);
  expect((await request.post(`/api/scenes/${sid}/restore`)).status()).toBe(404);
  expect((await request.get(`/api/scenes/${sid}?version=1`)).status()).toBe(
    400,
  );
  expect(errors).toEqual([]);
});
