-- Existing dimensions remain metres, byte-for-byte unchanged. No inferred conversion.
ALTER TABLE users ADD COLUMN length_display_unit TEXT NOT NULL DEFAULT 'CM' CHECK(length_display_unit IN ('CM','M'));
ALTER TABLE items ADD COLUMN dimension_verification_json TEXT;
-- A historical proportions checkbox is not evidence of verified real measurements.
UPDATE items SET status='DRAFT' WHERE status='ACTIVE';
