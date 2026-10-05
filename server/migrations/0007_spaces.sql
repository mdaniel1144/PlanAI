-- Only the current canonical entities; nullable fields preserve unknown legacy data.
ALTER TABLE entities ADD COLUMN enclosure_status TEXT CHECK(enclosure_status IS NULL OR enclosure_status IN ('CLOSED','OPEN','PARTIALLY_OPEN'));
ALTER TABLE entities ADD COLUMN floor_elevation REAL CHECK(floor_elevation IS NULL OR abs(floor_elevation)<1e308);
ALTER TABLE entities ADD COLUMN ceiling_elevation REAL CHECK((ceiling_elevation IS NULL OR abs(ceiling_elevation)<1e308) AND (ceiling_elevation IS NULL OR floor_elevation IS NULL OR ceiling_elevation>floor_elevation));
ALTER TABLE entities ADD COLUMN boundary_source TEXT CHECK(boundary_source IS NULL OR boundary_source IN ('walls','manual'));
UPDATE entities SET boundary_source=json_extract(data_json,'$.boundarySource') WHERE kind='room';
UPDATE entities SET data_json=json_remove(data_json,'$.boundarySource') WHERE kind='room';
CREATE TABLE space_boundary_edges (
  state_id TEXT NOT NULL,
  floor_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  edge_index INTEGER NOT NULL CHECK(edge_index>=0),
  edge_kind TEXT NOT NULL CHECK(edge_kind IN ('WALL','OPEN')),
  wall_id TEXT,
  start_x REAL NOT NULL CHECK(abs(start_x)<1e308),
  start_y REAL NOT NULL CHECK(abs(start_y)<1e308),
  end_x REAL NOT NULL CHECK(abs(end_x)<1e308),
  end_y REAL NOT NULL CHECK(abs(end_y)<1e308),
  PRIMARY KEY(state_id,space_id,edge_index),
  CHECK((edge_kind='WALL' AND wall_id IS NOT NULL) OR (edge_kind='OPEN' AND wall_id IS NULL)),
  FOREIGN KEY(state_id,floor_id,space_id) REFERENCES entities(state_id,floor_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(state_id,floor_id,wall_id) REFERENCES entities(state_id,floor_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER space_edges_kinds_insert BEFORE INSERT ON space_boundary_edges BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM entities WHERE state_id=NEW.state_id AND floor_id=NEW.floor_id AND id=NEW.space_id AND kind='room') THEN RAISE(ABORT,'Space edge requires a room') END;
  SELECT CASE WHEN NEW.edge_kind='WALL' AND NOT EXISTS(SELECT 1 FROM entities WHERE state_id=NEW.state_id AND floor_id=NEW.floor_id AND id=NEW.wall_id AND kind='wall') THEN RAISE(ABORT,'Space edge requires a wall') END;
END;
CREATE TRIGGER space_edges_kinds_update BEFORE UPDATE ON space_boundary_edges BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM entities WHERE state_id=NEW.state_id AND floor_id=NEW.floor_id AND id=NEW.space_id AND kind='room') THEN RAISE(ABORT,'Space edge requires a room') END;
  SELECT CASE WHEN NEW.edge_kind='WALL' AND NOT EXISTS(SELECT 1 FROM entities WHERE state_id=NEW.state_id AND floor_id=NEW.floor_id AND id=NEW.wall_id AND kind='wall') THEN RAISE(ABORT,'Space edge requires a wall') END;
END;
