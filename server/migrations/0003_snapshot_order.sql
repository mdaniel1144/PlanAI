-- Preserve source evidence order through immutable snapshot round trips.
ALTER TABLE evidence ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0;
UPDATE evidence SET ordinal=rowid;
ALTER TABLE entity_evidence ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0;
UPDATE entity_evidence SET ordinal=COALESCE((SELECT CAST(j.key AS INTEGER) FROM entities e,json_each(e.data_json,'$.evidenceIds') j WHERE e.version_id=entity_evidence.version_id AND e.id=entity_evidence.entity_id AND j.value=entity_evidence.evidence_id),0);
