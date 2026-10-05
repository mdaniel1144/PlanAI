import { test, expect, type Page } from "./fixtures";
import { sceneSchema } from "@habitat/domain";
async function point(page: Page, x: number, y: number) {
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
async function clickPlan(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function field(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press("Enter");
}
async function section(page: Page, name: string) {
  await page
    .locator(".window-fields summary")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();
}
test("architectural window assembly → current save/reload → real 3D cutout → host move → invalid shorten → correction", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Window engine home");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByLabel("Floor elevation", { exact: true })).toHaveValue(
    "0",
  );
  await page
    .getByRole("button", { name: "Create empty floor", exact: true })
    .click();
  await page.getByRole("button", { name: "Draw wall", exact: true }).click();
  await clickPlan(page, 1, 1);
  await clickPlan(page, 9, 1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add window", exact: true }).click();
  await expect(page.getByLabel("New opening width")).toBeVisible();
  await page.getByLabel("New opening width").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("New opening width")).toBeHidden();
  await page.keyboard.press("n");
  await expect(page.getByLabel("New opening width")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm window", exact: true }),
  ).toBeDisabled();
  // One click near the end keeps the entire opening on its host.
  await clickPlan(page, 8.9, 1);
  await expect(page.getByLabel("New opening position")).toHaveValue("6.8");
  const away = await point(page, 6, 3);
  await page.mouse.move(away.x, away.y);
  await expect(page.getByLabel("New opening position")).toHaveValue("6.8");
  await expect(page.locator("[data-opening-preview]")).toHaveAttribute(
    "data-valid",
    "true",
  );
  await page.getByLabel("New opening width").fill("10");
  await expect(
    page.getByRole("button", { name: "Confirm window", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".window-placement-error")).toContainText(
    "beyond host wall",
  );
  await page.getByLabel("New opening width").fill("2.40");
  await page
    .locator(".window-placement summary")
    .filter({ hasText: "Advanced placement" })
    .click();
  await page.getByLabel("New opening position").fill("1.00");
  await page.getByLabel("New window sill height").fill("0.90");
  await page.getByLabel("New window height").fill("1.50");
  await page.getByLabel("New window type").selectOption("sliding");
  await page
    .locator(".window-placement summary")
    .filter({ hasText: "Advanced placement" })
    .click();
  await page.screenshot({ path: "test-results/window-placement.png" });
  await page
    .getByRole("button", { name: "Confirm window", exact: true })
    .click();
  await expect(page.getByTestId("window-height")).toHaveText(
    "Derived height: 1.50 m",
  );
  await section(page, "Panels");
  await page.getByLabel("Panel count", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Apply panel layout" }).click();
  await page
    .getByLabel("Panel 1 operation", { exact: true })
    .selectOption("FIXED");
  await page
    .getByLabel("Panel 2 operation", { exact: true })
    .selectOption("SLIDING");
  await page
    .getByLabel("Panel 3 operation", { exact: true })
    .selectOption("SLIDING");
  // Known casement orientation produces a wall-local hinge/swing symbol.
  await page
    .getByLabel("Panel 2 operation", { exact: true })
    .selectOption("CASEMENT");
  await page
    .getByLabel("Panel 2 hinge", { exact: true })
    .selectOption("PANEL_END");
  await page
    .getByLabel("Panel 2 swing", { exact: true })
    .selectOption("WALL_RIGHT");
  await expect(
    page.locator(
      "[data-window-glyph] [data-operation='CASEMENT'] [data-hinge]",
    ),
  ).toHaveAttribute("data-hinge", "PANEL_END");
  await expect(
    page.locator(
      "[data-window-glyph] [data-operation='CASEMENT'] [data-swing]",
    ),
  ).toHaveAttribute("data-swing", "WALL_RIGHT");
  await page
    .getByLabel("Panel 2 operation", { exact: true })
    .selectOption("SLIDING");
  await field(page, "Sliding tracks", "2");
  await page
    .getByLabel("Panel 2 slide direction")
    .selectOption("TOWARD_PANEL_START");
  await page
    .getByLabel("Panel 3 slide direction")
    .selectOption("TOWARD_PANEL_START");
  await section(page, "Panels");
  await section(page, "Profile");
  await page.getByLabel("Profile material").selectOption("ALUMINUM");
  for (const [label, value] of [
    ["frameFaceWidth", ".05"],
    ["frameDepth", ".08"],
    ["sashFaceWidth", ".025"],
    ["sashDepth", ".04"],
  ])
    await field(page, `${label} (m)`, value);
  await section(page, "Profile");
  await section(page, "Glass");
  await page.getByLabel("Glazing type").selectOption("DOUBLE");
  await page.getByLabel("Glass finish", { exact: true }).selectOption("CLEAR");
  await section(page, "Glass");
  await section(page, "Shutter");
  await page.getByLabel("Shutter type").selectOption("ROLLER");
  await page.getByLabel("Shutter operation").selectOption("ELECTRIC");
  await page.getByLabel("Shutter box").selectOption("CONCEALED");
  await section(page, "Shutter");
  await section(page, "Screen");
  await page.getByLabel("Screen type").selectOption("SLIDING");
  await expect(page.locator("[data-window-glyph]")).toHaveAttribute(
    "data-panel-count",
    "3",
  );
  await expect(
    page.locator("[data-window-glyph] [data-operation='FIXED']"),
  ).toHaveCount(1);
  await expect(
    page.locator("[data-window-glyph] [data-operation='SLIDING']"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "2",
  );
  const project = page.url().split("/projects/")[1].split("/")[0],
    scenes = await (
      await request.get(`/api/projects/${project}/scenes`)
    ).json(),
    sid = scenes[0].id;
  const current = async () =>
    sceneSchema.parse(await (await request.get(`/api/scenes/${sid}`)).json());
  const saved = await current(),
    w = saved.floors[0].windows[0],
    ids = w.assembly!.panels!.map((p) => p.id);
  expect(w).toMatchObject({
    width: 2.4,
    bottomElevation: 0.9,
    topElevation: 2.4,
    height: null,
    sillHeight: null,
    assembly: {
      profile: { material: "ALUMINUM" },
      glazing: { glazingType: "DOUBLE", glassFinish: "CLEAR" },
      shutter: { type: "ROLLER", operation: "ELECTRIC", boxType: "CONCEALED" },
      screen: { type: "SLIDING" },
    },
  });
  await page.reload();
  await expect(page.locator(`[data-window-glyph='${w.id}']`)).toHaveAttribute(
    "data-panel-count",
    "3",
  );
  await clickPlan(page, 3, 1);
  await expect(page.getByLabel("Sill Height (m)", { exact: true })).toHaveValue(
    "0.9",
  );
  await page.screenshot({ path: "test-results/window-plan.png" });
  const signature = await page
    .locator(".plan-svg")
    .getAttribute("data-geometry-signature");
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-selected-id",
    w.id,
  );
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-geometry-signature",
    signature!,
  );
  const solid = JSON.parse(signature!) as {
    start: { x: number };
    end: { x: number };
    bottom: number;
    height: number;
  }[];
  expect(solid).toHaveLength(4);
  for (const s of solid)
    expect(
      Math.min(s.end.x, 4.4) - Math.max(s.start.x, 2) > 1e-7 &&
        Math.min(s.bottom + s.height, 2.4) - Math.max(s.bottom, 0.9) > 1e-7,
    ).toBe(false);
  const assemblies = JSON.parse(
    (await page.locator(".three-view").getAttribute("data-window-assemblies"))!,
  ) as { id: string; bottom: number; top: number; parts: { role: string }[] }[];
  expect(assemblies[0]).toMatchObject({ id: w.id, bottom: 0.9, top: 2.4 });
  expect(assemblies[0].parts.filter((p) => p.role === "frame")).toHaveLength(4);
  expect(assemblies[0].parts.filter((p) => p.role === "glass")).toHaveLength(3);
  await page.screenshot({ path: "test-results/window-assembly-3d.png" });
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-selected-id",
    w.id,
  );
  await field(page, "Window Height (m)", "1.45");
  await expect
    .poll(async () =>
      page.locator(".three-view").getAttribute("data-geometry-signature"),
    )
    .toBe(
      await page.locator(".plan-svg").getAttribute("data-geometry-signature"),
    );
  await field(page, "Window Height (m)", "1.5");

  await page.getByRole("button", { name: "2D plan", exact: true }).click();
  await clickPlan(page, 8, 1);
  await page.getByLabel("Move wall Y").fill("1");
  await page.getByRole("button", { name: "Move whole wall" }).click();
  await expect(
    page.locator(`[data-window-id='${w.id}'] > g`).first(),
  ).toHaveAttribute("transform", "translate(2 2) rotate(0)");
  // Drag sideways and away from the wall: only the parameter changes.
  const from = await point(page, 3, 2),
    to = await point(page, 3.5, 2.8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Math.abs(
        Number(
          await page.getByLabel("Position (m, opening start)").inputValue(),
        ) - 1.5,
      ),
    )
    .toBeLessThan(1e-6);
  await field(page, "Position (m, opening start)", "1");
  await clickPlan(page, 8, 2);
  await field(page, "Wall length (m)", "2");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toContainText(
    "WINDOW_OUTSIDE_HOST_WALL",
  );
  expect((await current()).revision).toBe(2);
  await field(page, "Wall length (m)", "8");
  await field(page, "Endpoint 2 Y", "6");
  const angled = await page
    .locator(`[data-window-id='${w.id}'] > g`)
    .first()
    .getAttribute("transform");
  expect(angled).toContain("rotate(26.56505117707799)");

  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "3",
  );
  await page.reload();
  await expect(page.locator(`[data-window-glyph='${w.id}']`)).toHaveAttribute(
    "data-panel-count",
    "3",
  );
  const final = await current();
  expect(final.floors[0].windows[0]).toMatchObject({
    id: w.id,
    wallId: w.wallId,
    positionAlongWall: 1,
    bottomElevation: 0.9,
    topElevation: 2.4,
  });
  expect(final.floors[0].windows[0].assembly!.panels!.map((p) => p.id)).toEqual(
    ids,
  );
  expect(final.floors[0].walls[0].start.y).toBe(2);
  expect(errors).toEqual([]);
});
