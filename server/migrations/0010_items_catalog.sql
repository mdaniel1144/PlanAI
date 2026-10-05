CREATE TABLE categories(id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE brands(id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE items(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', item_code TEXT,
 brand_id TEXT NOT NULL REFERENCES brands(id), category_id TEXT NOT NULL REFERENCES categories(id),
 base_model_asset_id TEXT, thumbnail_asset_id TEXT, default_variant_id TEXT,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','INACTIVE')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(id,base_model_asset_id) REFERENCES item_assets(item_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(id,thumbnail_asset_id) REFERENCES item_assets(item_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(id,default_variant_id) REFERENCES item_variants(item_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE item_assets(
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id),
 type TEXT NOT NULL CHECK(type IN ('GLB_MODEL','TEXTURE','THUMBNAIL')),
 storage_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, file_name TEXT NOT NULL,
 file_size INTEGER NOT NULL CHECK(file_size>0), sha256 TEXT NOT NULL,
 inspection_json TEXT, calibration_json TEXT, created_at TEXT NOT NULL, UNIQUE(item_id,id)
);
CREATE TABLE item_variants(
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), name TEXT NOT NULL,
 sku TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(sku))>0 AND sku=trim(sku)),
 price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor BETWEEN 0 AND 9007199254740991),
 currency TEXT NOT NULL CHECK(length(currency)=3),
 width REAL NOT NULL CHECK(width>0), depth REAL NOT NULL CHECK(depth>0), height REAL NOT NULL CHECK(height>0),
 color TEXT, finish TEXT, model_asset_id TEXT, thumbnail_asset_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(item_id,id),
 FOREIGN KEY(item_id,model_asset_id) REFERENCES item_assets(item_id,id),
 FOREIGN KEY(item_id,thumbnail_asset_id) REFERENCES item_assets(item_id,id)
);
CREATE TABLE item_material_slots(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id),name TEXT NOT NULL,UNIQUE(item_id,name),UNIQUE(item_id,id));
CREATE TABLE item_material_bindings(
 id TEXT PRIMARY KEY,item_id TEXT NOT NULL,slot_id TEXT NOT NULL,model_asset_id TEXT NOT NULL,material_index INTEGER NOT NULL CHECK(material_index>=0),node_index INTEGER CHECK(node_index>=0),
 FOREIGN KEY(item_id,slot_id) REFERENCES item_material_slots(item_id,id),
 FOREIGN KEY(item_id,model_asset_id) REFERENCES item_assets(item_id,id)
);
CREATE TABLE item_materials(
 id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id),name TEXT NOT NULL,base_color TEXT NOT NULL,
 roughness REAL NOT NULL CHECK(roughness BETWEEN 0 AND 1),metalness REAL NOT NULL CHECK(metalness BETWEEN 0 AND 1),opacity REAL NOT NULL CHECK(opacity BETWEEN 0 AND 1),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(item_id,id)
);
CREATE TABLE item_material_textures(
 item_id TEXT NOT NULL,material_id TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('BASE_COLOR','NORMAL','ROUGHNESS')),asset_id TEXT NOT NULL,
 PRIMARY KEY(material_id,channel),
 FOREIGN KEY(item_id,material_id) REFERENCES item_materials(item_id,id),
 FOREIGN KEY(item_id,asset_id) REFERENCES item_assets(item_id,id)
);
CREATE TABLE variant_material_overrides(
 item_id TEXT NOT NULL,variant_id TEXT NOT NULL,slot_id TEXT NOT NULL,material_id TEXT,base_color TEXT,
 PRIMARY KEY(variant_id,slot_id),CHECK((material_id IS NULL) != (base_color IS NULL)),
 FOREIGN KEY(item_id,variant_id) REFERENCES item_variants(item_id,id),
 FOREIGN KEY(item_id,slot_id) REFERENCES item_material_slots(item_id,id),
 FOREIGN KEY(item_id,material_id) REFERENCES item_materials(item_id,id)
);
CREATE TABLE project_item_instances(
 id TEXT PRIMARY KEY,state_id TEXT NOT NULL,floor_id TEXT NOT NULL,space_id TEXT,item_id TEXT NOT NULL,variant_id TEXT NOT NULL,
 position_x REAL NOT NULL,position_y REAL NOT NULL,rotation REAL NOT NULL,
 FOREIGN KEY(state_id,floor_id) REFERENCES floors(state_id,id),
 FOREIGN KEY(state_id,floor_id,space_id) REFERENCES entities(state_id,floor_id,id),
 FOREIGN KEY(item_id,variant_id) REFERENCES item_variants(item_id,id)
);
CREATE INDEX items_catalog ON items(status,category_id,brand_id,name,id);
CREATE INDEX variants_price ON item_variants(currency,price_minor,item_id);
CREATE INDEX instances_usage ON project_item_instances(item_id,variant_id);
CREATE INDEX instances_floor ON project_item_instances(state_id,floor_id);
INSERT INTO categories(id,name) VALUES ('sofa','Sofa'),('chair','Chair'),('table','Table'),('bed','Bed'),('cabinet','Cabinet'),('wardrobe','Wardrobe'),('door','Door'),('lighting','Lighting'),('bathroom','Bathroom'),('kitchen','Kitchen'),('storage','Storage'),('decor','Decor'),('other','Other');
