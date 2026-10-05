import { test, expect, type Page } from "./fixtures";
import { sceneSchema } from "@habitat/domain";
async function planPoint(page: Page, x: number, y: number) {
  return page.locator(".plan-svg").evaluate(
    (svg, p) => {
      const m = (svg as SVGSVGElement).getScreenCTM()!;
      const q = new DOMPoint(p.x, p.y).matrixTransform(m);
      return { x: q.x, y: q.y };
    },
    { x, y },
  );
}
async function clickPlan(page: Page, x: number, y: number) {
  const p = await planPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}
test("blank project → walls → Bedroom → hinged door → save → 3D → move → reload", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/projects/");
  await expect(
    page.getByText("Project structure", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill("Architectural drawing home");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/editor$/);
  await page.getByLabel("Floor name", { exact: true }).fill("Ground Floor");
  await page.getByLabel("Floor elevation", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Create empty floor", exact: true })
    .click();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "1",
  );
  await page.getByRole("button", { name: "Draw wall", exact: false }).click();
  for (const p of [
    [1, 1],
    [6, 1],
    [6, 5],
    [1, 5],
    [1, 1],
  ])
    await clickPlan(page, p[0], p[1]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "4",
  );
  await expect(page.locator(".saved-state")).toHaveText("Unsaved changes");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "3",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "4",
  );
  await expect(page.locator(".room-label")).toHaveCount(1);
  await clickPlan(page, 3, 3);
  await page.getByLabel("Space name", { exact: true }).fill("Bedroom");
  await page.getByLabel("Space name", { exact: true }).press("Enter");
  await page.getByLabel("Space type").selectOption("bedroom");
  await expect(page.locator(".entity-heading h2")).toHaveText("Bedroom");
  await page.getByRole("button", { name: "Add door", exact: false }).click();
  await clickPlan(page, 2, 1);
  await clickPlan(page, 2, 1);
  await page.getByLabel("Tool settings", { exact: true }).click();
  await page.getByLabel("New opening width").fill("0.90");
  await page.getByLabel("New opening position").fill("1.00");
  await page.getByLabel("New door hinge").selectOption("OPENING_END");
  await page.getByRole("button", { name: "Confirm door", exact: true }).click();
  await page.getByRole("button", { name: "Flip swing", exact: true }).click();
  await expect(page.locator(".door-envelope")).toHaveAttribute(
    "data-swing",
    "WALL_RIGHT",
  );
  await expect(page.locator(".door-envelope")).toHaveAttribute(
    "data-hinge",
    "OPENING_END",
  );
  // SPA navigation must not silently discard local architecture.
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay in editor" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "2",
  );
  const pid = page.url().split("/projects/")[1].split("/")[0];
  const identities = await (
    await request.get(`/api/projects/${pid}/scenes`)
  ).json();
  const sid = identities[0].id;
  const snapshot = async () =>
    sceneSchema.parse(await (await request.get(`/api/scenes/${sid}`)).json());
  const saved = await snapshot();
  expect(saved.floors[0].walls).toHaveLength(4);
  expect(saved.floors[0].doors[0].width).toBe(0.9);
  expect(saved.floors[0].rooms[0].name).toBe("Bedroom");
  const signature = await page
    .locator(".plan-svg")
    .getAttribute("data-geometry-signature");
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-wall-count",
    "4",
  );
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-opening-count",
    "1",
  );
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-solid-count",
    "6",
  );
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-geometry-signature",
    signature!,
  );
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-selected-id",
    saved.floors[0].doors[0].id,
  );
  await page.getByRole("button", { name: "2D plan", exact: true }).click();
  await clickPlan(page, 4, 1);
  await page.getByLabel("Move wall Y").fill("-0.5");
  await page
    .getByRole("button", { name: "Move whole wall", exact: true })
    .click();
  await expect(page.locator(".saved-state")).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const movedSignature = await page
    .locator(".plan-svg")
    .getAttribute("data-geometry-signature");
  expect(movedSignature).not.toBe(signature);
  await expect(page.locator(".three-view")).toHaveAttribute(
    "data-geometry-signature",
    movedSignature!,
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "3",
  );
  const moved = await snapshot();
  expect(moved.floors[0].walls[0].start.y).toBe(0.5);
  expect(moved.floors[0].doors[0].positionAlongWall).toBe(1);
  await page.screenshot({
    path: "test-results/architectural-drawing-split.png",
  });
  await page.reload();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "3",
  );
  expect((await snapshot()).floors).toEqual(moved.floors);
  await page.goto(`/projects/${pid}/export`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download scene JSON" }).click();
  const downloaded = await download;
  const stream = await downloaded.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(
    sceneSchema.parse(JSON.parse(Buffer.concat(chunks).toString())).floors[0]
      .doors[0].hingedOrientation,
  ).toEqual(moved.floors[0].doors[0].hingedOrientation);
  expect(errors).toEqual([]);
});

test("exact length, endpoint drag, protected deletion and invalid opening save", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Precision drawing");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create empty floor", exact: true })
    .click();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await page.keyboard.press("w");
  await clickPlan(page, 1, 2);
  const direction = await planPoint(page, 6, 2);
  await page.mouse.move(direction.x, direction.y);
  await page.keyboard.type("4.20");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "1",
  );
  await clickPlan(page, 3, 2);
  await expect(page.getByLabel("Wall length (m)")).toHaveValue("4.2");
  const a = await planPoint(page, 5.2, 2),
    b = await planPoint(page, 6, 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel("Wall length (m)")).toHaveValue("5");
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("Wall length (m)")).toHaveValue("4.2");
  await page.keyboard.press("d");
  await clickPlan(page, 2, 2);
  await clickPlan(page, 2, 2);
  await page.getByLabel("Tool settings", { exact: true }).click();
  await page.getByLabel("New opening position").fill("1");
  await page.getByRole("button", { name: "Confirm door", exact: true }).click();
  await clickPlan(page, 4, 2);
  await page.keyboard.press("Delete");
  await expect(page.getByRole("alert")).toContainText("Deletion blocked");
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "1",
  );
  await page.getByLabel("Wall length (m)").fill("1.5");
  await page.getByLabel("Wall length (m)").press("Enter");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("beyond its host wall");
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "1",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "2",
  );
  expect(errors).toEqual([]);
});

test("floorless scene offers Create Floor and drawing stays on the active floor", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", { data: { name: "Multiple floors" } })
  ).json();
  const initial = sceneSchema.parse(
    await (
      await request.post(`/api/projects/${project.id}/scenes`, {
        data: { floorName: "Temporary floor", elevation: 0 },
      })
    ).json(),
  );
  const empty = { ...initial, floors: [] };
  expect(
    (
      await request.put(`/api/scenes/${initial.id}`, {
        data: {
          expectedRevision: 1,
          scene: empty,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/projects/${project.id}/editor`);
  await expect(
    page.getByRole("heading", { name: "Create a floor", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Floor name", { exact: true }).fill("Ground Floor");
  await page.getByRole("button", { name: "Create floor", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "3",
  );
  const saved = sceneSchema.parse(
    await (await request.get(`/api/scenes/${initial.id}`)).json(),
  );
  const second = structuredClone(saved.floors[0]);
  second.id = "00000000-0000-4000-8000-000000008888";
  second.name = "First Floor";
  second.elevation = 3.5;
  saved.floors.push(second);
  expect(
    (
      await request.put(`/api/scenes/${initial.id}`, {
        data: { expectedRevision: 3, scene: saved },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.locator(".view-options > summary").click();
  await page
    .getByLabel("Current floor", { exact: true })
    .selectOption(second.id);
  await page.getByLabel("Current floor", { exact: true }).focus();
  await page.keyboard.press("w"); // A focused select must not trigger editor shortcuts.
  await expect(
    page.getByRole("button", { name: "Draw wall", exact: false }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.locator(".view-options > summary").click();
  await page.getByRole("button", { name: "Draw wall", exact: false }).click();
  await clickPlan(page, 1, 1);
  await clickPlan(page, 4, 1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "5",
  );
  const final = sceneSchema.parse(
    await (await request.get(`/api/scenes/${initial.id}`)).json(),
  );
  expect(final.floors[0].walls).toHaveLength(0);
  expect(final.floors[1].walls).toHaveLength(1);
  expect(final.floors[1].walls[0].floorId).toBe(second.id);
  expect(final.floors[1].elevation).toBe(3.5);
  expect(final.floors[1].walls[0].height).toBe(3);
  // Keep draft edits locked while a server-owned verification is pending.
  await clickPlan(page, 2, 1);
  let release = () => {};
  let intercepted = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  await page.route("**/verifications", async (route) => {
    intercepted();
    await hold;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Verify selected entity", exact: true })
      .click();
    await started;
    await expect(
      page.getByRole("button", { name: "Draw wall", exact: false }),
    ).toBeDisabled();
    await page.keyboard.press("w");
    await expect(
      page.getByRole("button", { name: "Select", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  } finally {
    release();
  }
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "6",
  );
  await expect(
    page.getByRole("button", { name: "Draw wall", exact: false }),
  ).toBeEnabled();
});

test("double-click finishes walls with automatic Spaces and advanced manual boundaries", async ({
  page,
  request,
}) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Double-click drawing");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create empty floor", exact: true })
    .click();
  await expect(page.locator(".plan-svg")).toBeVisible();
  const finishAt = async (x: number, y: number) => {
    const p = await planPoint(page, x, y);
    await page.mouse.dblclick(p.x, p.y);
    await expect(
      page.getByRole("button", { name: "Select", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("alert")).toHaveCount(0);
  };
  await page.getByRole("button", { name: "Draw wall", exact: true }).click();
  for (const [x, y] of [
    [1, 1],
    [6, 1],
    [6, 5],
    [1, 5],
  ])
    await clickPlan(page, x, y);
  await finishAt(1, 1);
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "4",
  );
  await clickPlan(page, 8, 6);
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "4",
  );
  await expect(page.locator(".room-label")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "3",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".plan-svg")).toHaveAttribute(
    "data-wall-count",
    "4",
  );
  await page.getByLabel("Advanced geometry").click();
  await page
    .getByRole("button", { name: "Manual boundary", exact: true })
    .click();
  await clickPlan(page, 7, 1);
  await clickPlan(page, 9, 1);
  await finishAt(9, 4);
  await expect(page.locator(".room-label")).toHaveCount(2);
  // Closing a manual boundary on its first vertex also avoids duplicate vertices.
  await page.getByLabel("Advanced geometry").click();
  await page
    .getByRole("button", { name: "Manual boundary", exact: true })
    .click();
  for (const [x, y] of [
    [7, 5],
    [9, 5],
    [9, 7],
    [7, 7],
  ])
    await clickPlan(page, x, y);
  await finishAt(7, 5);
  await expect(page.locator(".room-label")).toHaveCount(3);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scene-revision",
    "2",
  );
  const pid = page.url().split("/projects/")[1].split("/")[0];
  const identities = await (
    await request.get(`/api/projects/${pid}/scenes`)
  ).json();
  const saved = sceneSchema.parse(
    await (await request.get(`/api/scenes/${identities[0].id}`)).json(),
  );
  expect(saved.floors[0].walls).toHaveLength(4);
  expect(saved.floors[0].rooms.map((r) => r.boundary.length)).toEqual([
    4, 3, 4,
  ]);
  expect(
    saved.floors[0].walls.every(
      (w) => w.start.x !== w.end.x || w.start.y !== w.end.y,
    ),
  ).toBe(true);
});
