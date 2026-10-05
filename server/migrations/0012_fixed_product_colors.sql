-- Abort before any change rather than flatten any active or historical geometry.
CREATE TEMP TABLE catalog_geometry_guard(value INTEGER);
CREATE TEMP TRIGGER catalog_geometry_guard_fail BEFORE INSERT ON catalog_geometry_guard
WHEN NEW.value > 0 BEGIN SELECT RAISE(ABORT, 'ITEM_REQUIRES_SPLIT_BY_SIZE'); END;
INSERT INTO catalog_geometry_guard
SELECT COUNT(*) FROM items i WHERE EXISTS (
 SELECT 1 FROM item_variants a JOIN item_variants b ON a.item_id=b.item_id
 WHERE a.item_id=i.id AND (a.width != b.width OR a.depth != b.depth OR a.height != b.height
 OR COALESCE(a.model_asset_id,i.base_model_asset_id,'') != COALESCE(b.model_asset_id,i.base_model_asset_id,''))
);
DROP TRIGGER catalog_geometry_guard_fail;
DROP TABLE catalog_geometry_guard;
ALTER TABLE items ADD COLUMN width REAL CHECK(width>0 AND width<=10000);
ALTER TABLE items ADD COLUMN depth REAL CHECK(depth>0 AND depth<=10000);
ALTER TABLE items ADD COLUMN height REAL CHECK(height>0 AND height<=10000);
ALTER TABLE items ADD COLUMN base_price_minor INTEGER CHECK(base_price_minor BETWEEN 0 AND 9007199254740991);
ALTER TABLE items ADD COLUMN currency TEXT NOT NULL DEFAULT 'ILS';
ALTER TABLE items ADD COLUMN same_price_for_all_colors INTEGER NOT NULL DEFAULT 1 CHECK(same_price_for_all_colors IN (0,1));
ALTER TABLE item_variants ADD COLUMN color_sku TEXT COLLATE NOCASE;
ALTER TABLE item_variants ADD COLUMN price_override_minor INTEGER CHECK(price_override_minor BETWEEN 0 AND 9007199254740991);
ALTER TABLE item_variants ADD COLUMN currency_override TEXT;
CREATE UNIQUE INDEX colors_sku ON item_variants(color_sku) WHERE color_sku IS NOT NULL;
UPDATE items SET
 width=(SELECT width FROM item_variants WHERE item_id=items.id LIMIT 1),
 depth=(SELECT depth FROM item_variants WHERE item_id=items.id LIMIT 1),
 height=(SELECT height FROM item_variants WHERE item_id=items.id LIMIT 1),
 base_model_asset_id=COALESCE((SELECT COALESCE(model_asset_id,items.base_model_asset_id) FROM item_variants WHERE item_id=items.id LIMIT 1),base_model_asset_id),
 base_price_minor=(SELECT price_minor FROM item_variants WHERE item_id=items.id AND id=COALESCE(items.default_variant_id,(SELECT MIN(v2.id) FROM item_variants v2 WHERE v2.item_id=items.id)) LIMIT 1),
 currency=COALESCE((SELECT currency FROM item_variants WHERE item_id=items.id AND id=COALESCE(items.default_variant_id,(SELECT MIN(v2.id) FROM item_variants v2 WHERE v2.item_id=items.id)) LIMIT 1),'ILS');
UPDATE items SET same_price_for_all_colors=0 WHERE EXISTS(SELECT 1 FROM item_variants v WHERE v.item_id=items.id AND (v.price_minor!=items.base_price_minor OR v.currency!=items.currency));
UPDATE item_variants SET color_sku=sku, model_asset_id=NULL,
 price_override_minor=CASE WHEN price_minor!=(SELECT base_price_minor FROM items WHERE id=item_id) OR currency!=(SELECT currency FROM items WHERE id=item_id) THEN price_minor END,
 currency_override=CASE WHEN currency!=(SELECT currency FROM items WHERE id=item_id) THEN currency END;
