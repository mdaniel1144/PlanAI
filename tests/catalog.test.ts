import { verifiedDimensions } from "./dimension-fixture";
import { it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import sharp from "../server/node_modules/sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/src/app";
import { testGLB } from "./glb-fixture";
import { testPassword } from "./auth-helper";
import type { Item } from "@habitat/domain";
it("manages one model with three colors, validates uploads and scopes materials and catalog reads", async () => {
  const root = mkdtempSync(join(tmpdir(), "items-api-")),
    a = createApp(join(root, "db"), join(root, "files"), false);
  try {
    await a.auth.bootstrap({
      name: "Admin",
      email: "admin@items.test",
      password: testPassword,
    });
    await a.auth.createUser({
      name: "User",
      email: "user@items.test",
      role: "USER",
      password: testPassword,
    });
    const admin = request.agent(a.app).set("X-Habitat-Request", "1"),
      user = request.agent(a.app).set("X-Habitat-Request", "1");
    await admin
      .post("/api/auth/login")
      .send({ email: "admin@items.test", password: testPassword })
      .expect(200);
    await user
      .post("/api/auth/login")
      .send({ email: "user@items.test", password: testPassword })
      .expect(200);
    await user.post("/api/admin/items").send({}).expect(403);
    const brands = await admin
      .post("/api/admin/item-brands")
      .send({ name: "Example Co." })
      .expect(201);
    const brandId = brands.body[0].id;
    const invalidInformation = await admin
      .post("/api/admin/items")
      .send({ name: "   ", brandId: "", categoryId: "sofa" })
      .expect(400);
    expect(invalidInformation.body.error).toContain("name");
    expect(invalidInformation.body.error).toContain("Choose a brand");
    expect(invalidInformation.body.fields).toEqual(
      expect.arrayContaining(["name", "brandId"]),
    );

    let item: Item = (
      await admin
        .post("/api/admin/items")
        .send({ name: "Sofa 123", brandId, categoryId: "sofa" })
        .expect(201)
    ).body;
    const path = `/api/admin/items/${item.id}`;
    const savedEmpty = await admin
      .patch(path)
      .send({
        defaultVariantId: "",
        baseModelAssetId: "",
        thumbnailAssetId: "",
        status: "DRAFT",
      })
      .expect(200);
    expect(savedEmpty.body.defaultVariantId).toBeNull();
    const malformedDefault = await admin
      .patch(path)
      .send({ defaultVariantId: "bad" })
      .expect(400);
    expect(malformedDefault.body).toMatchObject({
      code: "ITEM_DEFAULT_COLOR_INVALID",
      error: "Choose an available default color.",
    });
    const incompletePublish = await admin
      .patch(path)
      .send({ status: "ACTIVE" })
      .expect(400);
    expect(incompletePublish.body.code).toBe("ITEM_NOT_PUBLISHABLE");
    expect(incompletePublish.body.blockingIssues.length).toBeGreaterThan(4);

    expect((await user.get("/api/items")).body.total).toBe(0);
    for (const name of ["model.obj", "model.gltf", "fake.glb"])
      await admin
        .post(`${path}/model`)
        .set("Content-Type", "application/octet-stream")
        .set("X-File-Name", name)
        .send(Buffer.from("not a model"))
        .expect(400);
    const upload = await admin
      .post(`${path}/model`)
      .set("Content-Type", "application/octet-stream")
      .set("X-File-Name", "sofa.glb")
      .send(testGLB())
      .expect(201);
    const modelId = upload.body.id;
    expect((await admin.get(path)).body.baseModelAssetId).toBe(modelId);
    const invalidDimensions = await admin
      .patch(`${path}/assets/${modelId}/calibration`)
      .send(
        verifiedDimensions({
          width: 0,
          depth: 0.95,
          height: 0.82,
          orientation: 0,
          confirmed: true,
        }),
      )
      .expect(400);
    expect(invalidDimensions.body.code).toBe("ITEM_DIMENSIONS_INVALID");
    expect(invalidDimensions.body.error).toContain("Real width");
    expect(invalidDimensions.body.fields).toContain("width");
    const outdatedDimensions = await admin
      .patch(`${path}/assets/${modelId}/calibration`)
      .send({ metresPerModelUnit: 1, orientation: 0, confirmed: true })
      .expect(400);
    expect(outdatedDimensions.body.fields).toContain("metresPerModelUnit");
    expect(outdatedDimensions.body.error).toContain("Reload the editor");
    expect(outdatedDimensions.body.issues).toContainEqual(
      expect.objectContaining({
        field: "metresPerModelUnit",
        message: expect.stringContaining("Reload the editor"),
      }),
    );

    await admin
      .patch(`${path}/assets/${modelId}/calibration`)
      .send(
        verifiedDimensions({
          width: 2.4,
          depth: 0.95,
          height: 0.82,
          orientation: 0,
          confirmed: true,
        }),
      )
      .expect(200);
    await admin
      .patch(path)
      .send({ baseModelAssetId: modelId, basePriceMinor: 690050 })
      .expect(200);
    item = (
      await admin.post(`${path}/slots`).send({ name: "FABRIC" }).expect(201)
    ).body;
    const slotId = item.slots[0].id;
    await admin
      .post(`${path}/bindings`)
      .send({ slotId, modelAssetId: modelId, materialIndex: 0 })
      .expect(201);
    const texture = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const thumb = (
      await admin
        .post(`${path}/thumbnails`)
        .set("Content-Type", "application/octet-stream")
        .set("X-File-Name", "sofa.png")
        .send(texture)
        .expect(201)
    ).body.id;
    await admin.patch(path).send({ thumbnailAssetId: thumb }).expect(200);
    const textureId = (
      await admin
        .post(`${path}/textures`)
        .set("Content-Type", "application/octet-stream")
        .set("X-File-Name", "fabric.png")
        .send(texture)
        .expect(201)
    ).body.id;
    await admin
      .post(`${path}/textures`)
      .set("Content-Type", "application/octet-stream")
      .set("X-File-Name", "fabric.svg")
      .send(Buffer.from("<svg/>"))
      .expect(400);

    for (const [name, color] of [
      ["Blue", "#0000ff"],
      ["White", "#ffffff"],
      ["Green", "#00ff00"],
    ]) {
      item = (
        await admin
          .post(`${path}/materials`)
          .send({
            name,
            baseColor: color,
            roughness: 0.8,
            metalness: 0,
            opacity: 1,
            textures:
              name === "Blue"
                ? [{ channel: "BASE_COLOR", assetId: textureId }]
                : [],
          })
          .expect(201)
      ).body;
      const materialId = item.materials.find((m) => m.name === name)!.id;
      item = (
        await admin
          .post(`${path}/variants`)
          .send({
            name,
            sku: ` X3213-${name} `,
            priceMinor: 690050,
            currency: "ILS",
            status: "ACTIVE",
            overrides: [{ slotId, materialId }],
          })
          .expect(201)
      ).body;
    }
    expect(item.assets.filter((a) => a.type === "GLB_MODEL")).toHaveLength(1);
    expect(
      item.variants.every(
        (v) => v.modelAssetId === null && v.priceMinor === 690050,
      ),
    ).toBe(true);
    await admin
      .post(`${path}/variants`)
      .send({
        name: "Duplicate",
        sku: "x3213-blue",
        priceMinor: 1,
        currency: "ILS",
        status: "ACTIVE",
      })
      .expect(409);
    await admin
      .patch(`${path}/variants/${item.variants[0].id}`)
      .send({ width: 3.2 })
      .expect(400);
    const noUvItem = (
      await admin
        .post("/api/admin/items")
        .send({ name: "No UV", brandId, categoryId: "sofa" })
        .expect(201)
    ).body;
    const noUvPath = `/api/admin/items/${noUvItem.id}`;
    const noUvBytes = testGLB((g) => {
      for (const mesh of g.meshes as {
        primitives: { attributes: Record<string, number> }[];
      }[])
        for (const p of mesh.primitives) delete p.attributes.TEXCOORD_0;
    });
    const noUv = (
      await admin
        .post(`${noUvPath}/model`)
        .set("Content-Type", "application/octet-stream")
        .set("X-File-Name", "no-uv.glb")
        .send(noUvBytes)
        .expect(201)
    ).body.id;
    await admin
      .patch(`${noUvPath}/assets/${noUv}/calibration`)
      .send(
        verifiedDimensions({
          width: 2.4,
          depth: 0.95,
          height: 0.82,
          orientation: 0,
          confirmed: true,
        }),
      )
      .expect(200);
    await admin
      .post(`${noUvPath}/color-targets`)
      .send({ targets: [{ materialIndex: 0, nodeIndex: 0 }] })
      .expect(200);
    const noUvTexture = (
      await admin
        .post(`${noUvPath}/textures`)
        .set("Content-Type", "application/octet-stream")
        .set("X-File-Name", "texture.png")
        .send(texture)
        .expect(201)
    ).body.id;
    const uvFailure = await admin
      .post(`${noUvPath}/colors`)
      .send({
        name: "No UV",
        status: "ACTIVE",
        baseColor: "#0000ff",
        textureAssetId: noUvTexture,
      })
      .expect(400);
    expect(uvFailure.body.code).toBe("ITEM_TEXTURE_UV_MISSING");
    await admin
      .post(`${noUvPath}/colors`)
      .send({ name: "Solid works", status: "ACTIVE", baseColor: "#ffffff" })
      .expect(201);
    for (const field of ["width", "depth", "height", "modelAssetId"]) {
      await admin
        .patch(`${path}/colors/${item.variants[0].id}`)
        .send({ [field]: field === "modelAssetId" ? modelId : 2.4 })
        .expect(400);
    }
    await admin
      .post(`${path}/model`)
      .set("Content-Type", "application/octet-stream")
      .set("X-File-Name", "duplicate.glb")
      .send(testGLB())
      .expect(409);
    const mismatch = await admin
      .patch(`${path}/assets/${modelId}/calibration`)
      .send(
        verifiedDimensions({
          width: 2.6,
          depth: 0.95,
          height: 0.82,
          orientation: 0,
          confirmed: true,
        }),
      )
      .expect(400);
    expect(mismatch.body.code).toBe("MODEL_DIMENSION_PROPORTION_MISMATCH");
    await admin.patch(path).send({ status: "ACTIVE" }).expect(200);
    expect(
      (
        await user.get(
          "/api/items?search=X3213-Blue&category=sofa&sort=price-asc&currency=ILS",
        )
      ).body.total,
    ).toBe(1);
    await user.get(`/api/item-assets/${modelId}`).expect(200);
    await user.get(`/api/item-assets/${noUv}`).expect(403);
    const other = (
      await admin
        .post("/api/admin/items")
        .send({ name: "Other", brandId, categoryId: "chair" })
        .expect(201)
    ).body;
    await admin
      .patch(`/api/admin/items/${other.id}`)
      .send({ baseModelAssetId: modelId })
      .expect(400);
    await admin
      .post(`/api/admin/items/${other.id}/materials`)
      .send({
        name: "Bad",
        baseColor: "#ffffff",
        roughness: 1,
        metalness: 0,
        opacity: 1,
        textures: [{ channel: "BASE_COLOR", assetId: thumb }],
      })
      .expect(400);
    const project = (
      await user
        .post("/api/projects")
        .send({ name: "Furnished project" })
        .expect(201)
    ).body;
    let scene = (
      await user
        .post(`/api/projects/${project.id}/scenes`)
        .send({ floorName: "Main", elevation: 3.2 })
        .expect(201)
    ).body;
    const placed = {
      id: randomUUID(),
      floorId: scene.floors[0].id,
      spaceId: null,
      itemId: item.id,
      variantId: item.variants[0].id,
      positionX: 2,
      positionY: 3,
      rotation: 0.4,
    };
    scene.floors[0].itemInstances = [{ ...placed, scaleX: 1.1 }];
    await user
      .put(`/api/scenes/${scene.id}`)
      .send({
        scene,
        expectedRevision: scene.revision,
        writerCapabilities: ["items-v1"],
      })
      .expect(400);
    scene.floors[0].itemInstances = [placed];
    await user
      .put(`/api/scenes/${scene.id}`)
      .send({ scene, expectedRevision: scene.revision })
      .expect(409);
    scene = (
      await user
        .put(`/api/scenes/${scene.id}`)
        .send({
          scene,
          expectedRevision: scene.revision,
          writerCapabilities: ["items-v1"],
        })
        .expect(200)
    ).body;
    expect(
      (await user.get(`/api/scenes/${scene.id}`)).body.floors[0].itemInstances,
    ).toEqual([{ ...placed, modelAssetId: modelId }]);
    const counts = () =>
      Object.fromEntries(
        ["items", "item_variants", "item_assets", "categories"].map((table) => [
          table,
          (
            a.repo.db.sqlite
              .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
              .get() as { n: number }
          ).n,
        ]),
      );
    const canonicalCounts = counts();
    const save = async (value: typeof scene) =>
      (
        await user
          .put(`/api/scenes/${scene.id}`)
          .send({
            scene: value,
            expectedRevision: scene.revision,
            writerCapabilities: ["items-v1"],
          })
          .expect(200)
      ).body;
    scene.floors[0].itemInstances = Array.from({ length: 5 }, (_, index) => ({
      ...placed,
      id: index ? randomUUID() : placed.id,
      positionX: 2 + index,
      modelAssetId: modelId,
    }));
    scene = await save(scene);
    expect(scene.floors[0].itemInstances).toHaveLength(5);
    expect(counts()).toEqual(canonicalCounts);
    for (const instance of scene.floors[0].itemInstances) {
      expect(instance.modelAssetId).toBe(modelId);
      expect(instance).not.toHaveProperty("width");
      expect(instance).not.toHaveProperty("name");
    }
    const forged = structuredClone(scene);
    forged.floors[0].itemInstances[0].modelAssetId = randomUUID();
    await user
      .put(`/api/scenes/${scene.id}`)
      .send({
        scene: forged,
        expectedRevision: scene.revision,
        writerCapabilities: ["items-v1"],
      })
      .expect(409);
    scene.floors[0].itemInstances.pop();
    scene = await save(scene);
    expect(scene.floors[0].itemInstances).toHaveLength(4);
    expect(counts()).toEqual(canonicalCounts);
    await user.get(`/api/item-assets/${modelId}`).expect(200);
    // Current architecture locks used technical data instead of publishing V2
    // under the same Product. Appearance must obey the same reproducibility rule.
    await admin
      .patch(`${path}/variants/${placed.variantId}`)
      .send({ overrides: [{ slotId, materialId: null, baseColor: "#123456" }] })
      .expect(409);
    const usedMaterial = item.variants[0].overrides[0].materialId;
    if (usedMaterial)
      await admin
        .patch(`${path}/materials/${usedMaterial}`)
        .send({ roughness: 0.123 })
        .expect(409);
    scene.floors[0].itemInstances = [scene.floors[0].itemInstances[0]];
    scene = await save(scene);

    await admin
      .patch(`${path}/assets/${modelId}/calibration`)
      .send(
        verifiedDimensions({
          width: 4.8,
          depth: 1.9,
          height: 1.64,
          orientation: 0,
          confirmed: true,
        }),
      )
      .expect(409);
    await admin
      .patch(`${path}/variants/${placed.variantId}`)
      .send({ width: 3.2 })
      .expect(400);
    await admin
      .put(`${path}/model`)
      .set("Content-Type", "application/octet-stream")
      .set("X-File-Name", "replacement.glb")
      .send(testGLB())
      .expect(409);
    await admin.patch(path).send({ width: 2.6 }).expect(409);
    await admin.patch(path).send({ baseModelAssetId: null }).expect(409);
    await admin
      .post(`${path}/bindings`)
      .send({ slotId, modelAssetId: modelId, materialIndex: 1 })
      .expect(409);
    await admin
      .patch(path)
      .send({ description: "Updated metadata" })
      .expect(200);
    await admin.patch(path).send({ status: "INACTIVE" }).expect(200);
    expect((await user.get(`/api/scenes/${scene.id}/items`)).body[0].id).toBe(
      item.id,
    );
    await user.get(`/api/item-assets/${modelId}`).expect(200);
    scene = (
      await user
        .put(`/api/scenes/${scene.id}`)
        .send({
          scene,
          expectedRevision: scene.revision,
          writerCapabilities: ["items-v1"],
        })
        .expect(200)
    ).body;
    scene.floors[0].itemInstances.push({ ...placed, id: randomUUID() });
    await user
      .put(`/api/scenes/${scene.id}`)
      .send({
        scene,
        expectedRevision: scene.revision,
        writerCapabilities: ["items-v1"],
      })
      .expect(400);

    expect((await user.get("/api/items")).body.total).toBe(0);
    await user.get(`/api/item-assets/${modelId}`).expect(200);
    expect(
      (await admin.get("/api/admin/items?status=INACTIVE")).body.total,
    ).toBe(1);
    // Historical resolution must retain actual inactive statuses, including the default-color alias.
    for (const color of item.colors.filter((c) => c.id !== placed.variantId))
      await admin
        .patch(`${path}/colors/${color.id}`)
        .send({ status: "INACTIVE" })
        .expect(200);
    await admin
      .patch(`${path}/colors/${placed.variantId}`)
      .send({ status: "INACTIVE" })
      .expect(200);
    const historical = (await user.get(`/api/scenes/${scene.id}/items`))
      .body[0];
    expect(historical.defaultColor).toBeNull();
    expect(historical.colors[0].status).toBe("INACTIVE");
    expect(a.repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally {
    a.close();
    rmSync(root, { recursive: true, force: true });
  }
});
