import { it, expect } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../server/src/app";
import { testPassword } from "./auth-helper";
it("stores immutable files outside SQLite, serves IDs with authorization, recovers after restart and compensates failure", async () => {
  const root = mkdtempSync(join(tmpdir(), "catalog-store-")),
    path = join(root, "db.sqlite"),
    item = randomUUID();
  let a = createApp(path, join(root, "storage"), false);
  try {
    a.repo.db.sqlite
      .prepare("INSERT INTO brands VALUES (?,?,?)")
      .run("example", "Example", 1);
    a.repo.db.sqlite
      .prepare(
        "INSERT INTO items(id,name,brand_id,category_id,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      )
      .run(item, "Sofa", "example", "sofa", "now", "now");
    await a.auth.bootstrap({
      email: "admin@store.test",
      name: "Admin",
      password: testPassword,
    });
    await a.auth.createUser({
      email: "user@store.test",
      name: "User",
      password: testPassword,
      role: "USER",
    });
    const admin = request.agent(a.app).set("X-Habitat-Request", "1"),
      user = request.agent(a.app).set("X-Habitat-Request", "1");
    await admin
      .post("/api/auth/login")
      .send({ email: "admin@store.test", password: testPassword })
      .expect(200);
    await user
      .post("/api/auth/login")
      .send({ email: "user@store.test", password: testPassword })
      .expect(200);
    const bytes = Buffer.from("preserved original bytes");
    const id = a.assets.register(
      item,
      "GLB_MODEL",
      "fixture.glb",
      "model/gltf-binary",
      bytes,
    );
    const asset = a.repo.db.sqlite
      .prepare("SELECT * FROM item_assets WHERE id=?")
      .get(id) as { storage_key: string };
    expect(asset.storage_key).toMatch(/^items\/[\da-f-]+\/models\/[\da-f-]+$/);
    expect(a.assets.storage.read(asset.storage_key)).toEqual(bytes);
    await user.get(`/api/item-assets/${id}`).expect(403);
    await user
      .post(`/api/admin/items/${item}/model`)
      .set("Content-Type", "application/octet-stream")
      .send(bytes)
      .expect(403);
    await admin.get(`/api/item-assets/${id}`).expect(200);
    expect(() => a.assets.storage.read("../../etc/passwd")).toThrow();
    a.repo.db.sqlite.exec(
      "CREATE TRIGGER fail_asset BEFORE INSERT ON item_assets BEGIN SELECT RAISE(ABORT,'test rollback'); END;",
    );
    expect(() =>
      a.assets.register(item, "TEXTURE", "broken.png", "image/png", bytes),
    ).toThrow("test rollback");
    expect(
      readdirSync(join(root, "storage", `items/${item}/models`)),
    ).toHaveLength(1);
    a.close();
    a = createApp(path, join(root, "storage"), false);
    expect(a.assets.storage.read(asset.storage_key)).toEqual(bytes);
    expect(
      a.repo.db.sqlite.pragma("table_info(item_assets)"),
    ).not.toContainEqual(expect.objectContaining({ type: "BLOB" }));
  } finally {
    a.close();
    rmSync(root, { recursive: true, force: true });
  }
});
