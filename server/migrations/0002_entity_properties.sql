-- Keep searchable scalar architectural properties in typed columns.
-- JSON now contains only geometry and kind-specific claim metadata.
ALTER TABLE entities ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE entities ADD COLUMN verification TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(verification IN ('UNKNOWN','DETECTED','LOW_CONFIDENCE','VERIFIED','USER_CORRECTED','REJECTED','CONFLICTING'));
ALTER TABLE entities ADD COLUMN confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1);
ALTER TABLE entities ADD COLUMN entity_type TEXT;
ALTER TABLE entities ADD COLUMN thickness REAL CHECK(thickness IS NULL OR thickness>0);
ALTER TABLE entities ADD COLUMN height REAL CHECK(height IS NULL OR height>0);
ALTER TABLE entities ADD COLUMN width REAL CHECK(width IS NULL OR width>0);
ALTER TABLE entities ADD COLUMN base REAL;
ALTER TABLE entities ADD COLUMN position_along_wall REAL CHECK(position_along_wall IS NULL OR position_along_wall>=0);
ALTER TABLE entities ADD COLUMN sill_height REAL CHECK(sill_height IS NULL OR sill_height>=0);
ALTER TABLE entities ADD COLUMN area REAL CHECK(area IS NULL OR area>0);
UPDATE entities SET name=json_extract(data_json,'$.name'), verification=json_extract(data_json,'$.verification'), confidence=json_extract(data_json,'$.confidence'), entity_type=json_extract(data_json,'$.type'), thickness=json_extract(data_json,'$.thickness'),height=json_extract(data_json,'$.height'),width=json_extract(data_json,'$.width'),base=json_extract(data_json,'$.base'),position_along_wall=json_extract(data_json,'$.positionAlongWall'),sill_height=json_extract(data_json,'$.sillHeight'),area=json_extract(data_json,'$.area');
UPDATE entities SET data_json=json_remove(data_json,'$.id','$.floorId','$.kind','$.name','$.verification','$.confidence','$.evidenceIds','$.wallId','$.leftRoomId','$.rightRoomId','$.fromRoomId','$.toRoomId','$.type','$.thickness','$.height','$.width','$.base','$.positionAlongWall','$.sillHeight','$.area');
CREATE INDEX entities_verification ON entities(version_id,verification);
