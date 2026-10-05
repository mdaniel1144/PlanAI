-- Nullable world elevations; legacy relative geometry remains readable verbatim.
ALTER TABLE entities ADD COLUMN bottom_elevation REAL CHECK(bottom_elevation IS NULL OR kind='window');
ALTER TABLE entities ADD COLUMN top_elevation REAL CHECK(top_elevation IS NULL OR (kind='window' AND (bottom_elevation IS NULL OR top_elevation>bottom_elevation)));
CREATE TRIGGER window_elevation_update BEFORE UPDATE OF bottom_elevation,top_elevation ON entities
WHEN NEW.bottom_elevation IS NOT NULL AND NEW.top_elevation IS NOT NULL AND NEW.top_elevation<=NEW.bottom_elevation
BEGIN SELECT RAISE(ABORT,'Window top must exceed bottom'); END;
