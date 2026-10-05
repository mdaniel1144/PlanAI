import { it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import {
  formatLength,
  parseDisplayLength,
  lengthInputValue,
  uniformCalibration,
  orientedModelDimensions,
  dimensionPlausibility,
  renderedDimensionsMatch,
} from "@habitat/domain";
import { createApp } from "../server/src/app";
import { CatalogService } from "../server/src/modules/items/service";
import { inspectGLB } from "../server/src/modules/items/glb";
import { testGLB } from "./glb-fixture";
import { verifiedDimensions, dimensionAdmin } from "./dimension-fixture";
import {
  loadModel,
  cloneModel,
  clearModelCache,
} from "../frontend/src/features/items/model-cache";
import {
  calibratedModel,
  renderedModelBounds,
} from "../frontend/src/features/items/model-transform";
import { PerspectiveCamera } from "three";
import { testPassword } from "./auth-helper";
it("converts display lengths without changing canonical precision or reinterpreting metres", () => {
  expect(formatLength(2, "CM")).toBe("200 cm");
  expect(formatLength(2, "M")).toBe("2.00 m");
  expect(parseDisplayLength("200", "CM")).toBe(2);
  expect(formatLength(0.7837, "CM")).toBe("78.37 cm");
  expect(formatLength(0.7837, "M")).toBe("0.7837 m");
  expect(lengthInputValue(0.7837, "CM")).toBe("78.37");
  expect(parseDisplayLength(lengthInputValue(0.7837, "CM"), "CM")).toBeCloseTo(
    0.7837,
    12,
  );
  expect(() => parseDisplayLength("", "CM")).toThrow();
  expect(() => parseDisplayLength("Infinity", "M")).toThrow();
});
it("maps orientation independently, accepts one uniform scale, and warns on a plausible ratio with wrong units", () => {
  const raw = { width: 0.7837, depth: 2, height: 0.6017 };
  const oriented = orientedModelDimensions(raw, 90);
  expect(oriented).toEqual({ width: 2, depth: 0.7837, height: 0.6017 });
  expect(
    uniformCalibration(raw, { ...oriented, orientation: 90, confirmed: true })
      .metresPerModelUnit,
  ).toBeCloseTo(1);
  const tiny = { width: 0.02, depth: 0.007837, height: 0.006017 };
  expect(dimensionPlausibility("sofa", tiny)).toMatchObject({
    code: "ITEM_DIMENSIONS_IMPLAUSIBLE",
    suggestedFactor: 100,
  });
  expect(dimensionPlausibility("sofa", oriented)).toBeNull();
  expect(() =>
    uniformCalibration(
      { width: 2, depth: 0.8, height: 0.6 },
      { width: 2, depth: 1.3, height: 0.6, orientation: 0, confirmed: true },
    ),
  ).toThrow("MODEL_DIMENSION_PROPORTION_MISMATCH");
});
it("measures actual GLB world geometry through the shared renderer transform; cameras never change bounds", async () => {
  const bytes = testGLB(),
    inspection = await inspectGLB(bytes);
  const source = await loadModel(
    "dimension-proof",
    async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  );
  const instance = cloneModel(source);
  try {
    const asset = {
      inspection,
      calibration: {
        metresPerModelUnit: 0.5,
        orientation: 90 as const,
        confirmed: true as const,
      },
    } as Parameters<typeof calibratedModel>[1];
    const model = calibratedModel(instance.scene, asset),
      before = renderedModelBounds(model);
    expect(
      renderedDimensionsMatch(before, {
        width: 0.475,
        depth: 1.2,
        height: 0.41,
      }),
    ).toBe(true);
    for (const [x, y, z, aspect, zoom] of [
      [4, 3, 5, 1, 1],
      [-5, 1, 2, 2, 3],
      [0, 10, 0, 0.5, 0.4],
    ]) {
      const camera = new PerspectiveCamera(42, aspect);
      camera.position.set(x, y, z);
      camera.zoom = zoom;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      expect(renderedModelBounds(model)).toEqual(before);
    }
    model.scale.x *= 2;
    expect(
      renderedDimensionsMatch(renderedModelBounds(model), {
        width: 0.475,
        depth: 1.2,
        height: 0.41,
      }),
    ).toBe(false);
  } finally {
    instance.dispose();
    clearModelCache();
  }
});
it("migration invalidates legacy confirmation without converting measurements or disturbing references", () => {
  const db = new Database(":memory:");
  try {
    db.exec(
      "CREATE TABLE users(id TEXT); CREATE TABLE items(id TEXT,width REAL,depth REAL,height REAL,status TEXT,base_model_asset_id TEXT); INSERT INTO users VALUES('person'); INSERT INTO items VALUES('sofa',.007837,.02,.006017,'ACTIVE','original-model');",
    );
    db.exec(
      readFileSync(
        new URL(
          "../server/migrations/0013_dimension_verification.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(db.prepare("SELECT * FROM items").get()).toEqual({
      id: "sofa",
      width: 0.007837,
      depth: 0.02,
      height: 0.006017,
      status: "DRAFT",
      base_model_asset_id: "original-model",
      dimension_verification_json: null,
    });
    expect(db.prepare("SELECT length_display_unit FROM users").get()).toEqual({
      length_display_unit: "CM",
    });
  } finally {
    db.close();
  }
});
it("enforces verification source, actor, plausibility acknowledgment and actual-size proof on the server", async () => {
  const root = mkdtempSync(join(tmpdir(), "dimensions-")),
    a = createApp(join(root, "db.sqlite"), join(root, "storage"), false),
    c = new CatalogService(a.repo.db.sqlite);
  try {
    c.db.prepare("INSERT INTO brands VALUES('brand','Brand',1)").run();
    let item = c.saveItem({
      name: "Sofa",
      brandId: "brand",
      categoryId: "sofa",
    });
    const bytes = testGLB(),
      model = a.assets.register(
        item.id,
        "GLB_MODEL",
        "sofa.glb",
        "model/gltf-binary",
        bytes,
        await inspectGLB(bytes),
      );
    const actor = dimensionAdmin(c.db),
      input = verifiedDimensions({
        width: 2.4,
        depth: 0.95,
        height: 0.82,
        orientation: 0,
        confirmed: true,
      });
    const confirm = (value: unknown, id: string | undefined = actor) =>
      c.calibrate(item.id, model, value, id);
    expect(() => confirm({ ...input, dimensionSource: undefined })).toThrow(
      expect.objectContaining({ code: "ITEM_DIMENSION_SOURCE_REQUIRED" }),
    );
    expect(() => confirm({ ...input, dimensionsVerified: false })).toThrow(
      expect.objectContaining({ code: "ITEM_DIMENSIONS_UNCONFIRMED" }),
    );
    expect(() => confirm(input, "not-an-admin")).toThrow(
      expect.objectContaining({ code: "ITEM_ADMIN_REQUIRED" }),
    );
    expect(() => confirm({ ...input, orientation: 45 })).toThrow(
      expect.objectContaining({ code: "MODEL_ORIENTATION_INVALID" }),
    );
    expect(() =>
      confirm({
        ...input,
        renderedBoundsMeters: { min: [-2, 0, -2], max: [2, 4, 2] },
      }),
    ).toThrow(
      expect.objectContaining({ code: "MODEL_RENDERED_DIMENSION_MISMATCH" }),
    );
    const tiny = verifiedDimensions({
      ...input,
      width: 0.024,
      depth: 0.0095,
      height: 0.0082,
    });
    expect(() =>
      confirm({ ...tiny, unusualDimensionsAcknowledged: false }),
    ).toThrow(expect.objectContaining({ code: "ITEM_DIMENSIONS_IMPLAUSIBLE" }));
    expect(c.get(item.id).calibrationStatus).toBe("UNCONFIRMED");
    item = confirm(tiny);
    expect(item.dimensionVerification).toMatchObject({
      verifiedByUserId: actor,
      dimensionsVerified: true,
      unusualDimensionsAcknowledged: true,
      dimensionSource: "MANUAL_MEASUREMENT",
    });
    item = confirm(input);
    expect(item.calibrationStatus).toBe("VERIFIED");
    expect(item.width).toBe(2.4);
    c.saveItem({ categoryId: "chair" }, item.id);
    expect(c.get(item.id).calibrationStatus).toBe("INVALID");
    expect(c.get(item.id).thumbnailGeneration?.signature).toBeNull();
    c.saveItem({ categoryId: "sofa" }, item.id);
    expect(c.get(item.id).calibrationStatus).toBe("VERIFIED");
    expect(
      item.assets.find((a) => a.id === model)?.inspection?.dimensions.width,
    ).toBeCloseTo(2.4);
    c.db.prepare("UPDATE items SET width=? WHERE id=?").run(2.41, item.id);
    expect(c.get(item.id).calibrationStatus).toBe("INVALID");
    expect(c.get(item.id).thumbnailGeneration?.signature).toBeNull();
  } finally {
    a.close();
    rmSync(root, { recursive: true, force: true });
  }
});
it("persists display preferences per authenticated user and rejects invalid units without altering project data", async () => {
  const root = mkdtempSync(join(tmpdir(), "units-")),
    a = createApp(join(root, "db.sqlite"), join(root, "storage"));
  try {
    await a.auth.bootstrap({
      email: "units@example.test",
      name: "Units admin",
      password: testPassword,
    });
    const user = await a.auth.createUser({
      email: "other@example.test",
      name: "Other",
      password: testPassword,
      role: "USER",
    });
    const api = request.agent(a.app).set("X-Habitat-Request", "1");
    await api
      .post("/api/auth/login")
      .send({ email: "units@example.test", password: testPassword })
      .expect(200);
    const before = a.repo.db.sqlite.prepare("SELECT * FROM projects").all();
    expect((await api.get("/api/auth/me")).body.lengthDisplayUnit).toBe("CM");
    await api
      .patch("/api/account/display")
      .send({ lengthDisplayUnit: "M" })
      .expect(200);
    expect((await api.get("/api/auth/me")).body.lengthDisplayUnit).toBe("M");
    const invalid = await api
      .patch("/api/account/display")
      .send({ lengthDisplayUnit: "INCH" })
      .expect(400);
    expect(invalid.body.code).toBe("ITEM_DISPLAY_UNIT_INVALID");
    expect(a.auth.repo.require(user.id).lengthDisplayUnit).toBe("CM");
    expect(a.repo.db.sqlite.prepare("SELECT * FROM projects").all()).toEqual(
      before,
    );
    await request(a.app)
      .patch("/api/account/display")
      .set("X-Habitat-Request", "1")
      .send({ lengthDisplayUnit: "M" })
      .expect(401);
  } finally {
    a.close();
    rmSync(root, { recursive: true, force: true });
  }
});
