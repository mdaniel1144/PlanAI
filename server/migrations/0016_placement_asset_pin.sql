-- Pin the existing canonical asset; no product or asset copies are created.
ALTER TABLE project_item_instances ADD COLUMN model_asset_id TEXT REFERENCES item_assets(id);
UPDATE project_item_instances SET model_asset_id = (
  SELECT base_model_asset_id FROM items WHERE items.id = project_item_instances.item_id
);
