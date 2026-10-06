import { it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
const sql = readFileSync(
  new URL(
    "../server/migrations/0012_fixed_product_colors.sql",
    import.meta.url,
  ),
  "utf8",
);
function legacy() {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE floors(state_id TEXT,id TEXT,PRIMARY KEY(state_id,id)); CREATE TABLE entities(state_id TEXT,floor_id TEXT,id TEXT,PRIMARY KEY(state_id,floor_id,id)); INSERT INTO floors VALUES('state','floor');",
  );
  db.exec("BEGIN; PRAGMA defer_foreign_keys=ON;");
  db.exec(
    readFileSync(
      new URL("../server/migrations/0010_items_catalog.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    "INSERT INTO brands VALUES('brand','Brand',1); INSERT INTO items(id,name,brand_id,category_id,base_model_asset_id,default_variant_id,created_at,updated_at) VALUES('item','Sofa','brand','sofa','model','blue','now','now');",
  );
  const insert = db.prepare(
    "INSERT INTO item_variants(id,item_id,name,sku,price_minor,currency,width,depth,height,status,created_at,updated_at) VALUES(?,'item',?,?,690000,'ILS',2.4,.95,.82,'ACTIVE','now','now')",
  );
  insert.run("blue", "Blue", "SKU-B");
  insert.run("white", "White", "SKU-W");
  db.exec(
    "INSERT INTO item_assets VALUES('model','item','GLB_MODEL','model-key','model/gltf-binary','model.glb',1,'hash',NULL,NULL,'now'); INSERT INTO item_assets VALUES('another-model','item','GLB_MODEL','other-key','model/gltf-binary','other.glb',1,'hash',NULL,NULL,'now'); COMMIT;",
  );
  return db;
}
it("migrates safe legacy geometry, preserves color IDs, SKU, appearance rows and references", () => {
  const db = legacy();
  try {
    db.exec(
      "INSERT INTO item_material_slots VALUES('slot','item','FABRIC'); INSERT INTO variant_material_overrides VALUES('item','blue','slot',NULL,'#0000ff'); INSERT INTO project_item_instances VALUES('placed','state','floor',NULL,'item','blue',2,3,.5)",
    );
    const before = db.prepare("SELECT * FROM variant_material_overrides").all(),
      instances = db.prepare("SELECT * FROM project_item_instances").all();
    db.transaction(() => db.exec(sql))();
    expect(
      db
        .prepare(
          "SELECT width,depth,height,base_model_asset_id,base_price_minor,same_price_for_all_colors FROM items",
        )
        .get(),
    ).toEqual({
      width: 2.4,
      depth: 0.95,
      height: 0.82,
      base_model_asset_id: "model",
      base_price_minor: 690000,
      same_price_for_all_colors: 1,
    });
    expect(
      db
        .prepare(
          "SELECT id,color_sku,model_asset_id,price_override_minor FROM item_variants ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        id: "blue",
        color_sku: "SKU-B",
        model_asset_id: null,
        price_override_minor: null,
      },
      {
        id: "white",
        color_sku: "SKU-W",
        model_asset_id: null,
        price_override_minor: null,
      },
    ]);
    expect(
      db.prepare("SELECT * FROM variant_material_overrides").all(),
    ).toEqual(before);
    expect(db.prepare("SELECT * FROM project_item_instances").all()).toEqual(
      instances,
    );
  } finally {
    db.close();
  }
});
for (const mutation of [
  "UPDATE item_variants SET width=2.6 WHERE id='white'",
  "UPDATE item_variants SET model_asset_id='another-model',status='INACTIVE' WHERE id='white'",
])
  it(`refuses incompatible legacy geometry atomically: ${mutation}`, () => {
    const db = legacy();
    try {
      db.exec(mutation);
      const before = db.prepare("SELECT * FROM item_variants").all();
      expect(() => db.transaction(() => db.exec(sql))()).toThrow(
        "ITEM_REQUIRES_SPLIT_BY_SIZE",
      );
      expect(db.prepare("SELECT * FROM item_variants").all()).toEqual(before);
      expect(db.pragma("table_info(items)")).not.toContainEqual(
        expect.objectContaining({ name: "width" }),
      );
    } finally {
      db.close();
    }
  });
it("retains legacy price and currency differences as optional color overrides", () => {
  const db = legacy();
  try {
    db.exec(
      "UPDATE item_variants SET price_minor=12500,currency='EUR' WHERE id='white'",
    );
    db.transaction(() => db.exec(sql))();
    expect(
      db
        .prepare(
          "SELECT price_override_minor,currency_override FROM item_variants WHERE id='white'",
        )
        .get(),
    ).toEqual({ price_override_minor: 12500, currency_override: "EUR" });
    expect(
      db.prepare("SELECT same_price_for_all_colors FROM items").get(),
    ).toEqual({ same_price_for_all_colors: 0 });
  } finally {
    db.close();
  }
});

it("pins legacy placements to their existing asset without copying canonical records", () => {
  const db = legacy();
  try {
    db.exec(
      "INSERT INTO project_item_instances VALUES('placed','state','floor',NULL,'item','blue',2,3,.5)",
    );
    const before = db
      .prepare("SELECT * FROM project_item_instances")
      .get() as Record<string, unknown>;
    const assets = db.prepare("SELECT * FROM item_assets").all();
    db.exec(
      readFileSync(
        new URL(
          "../server/migrations/0016_placement_asset_pin.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(db.prepare("SELECT * FROM project_item_instances").get()).toEqual({
      ...before,
      model_asset_id: "model",
    });
    expect(db.prepare("SELECT * FROM item_assets").all()).toEqual(assets);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  } finally {
    db.close();
  }
});
