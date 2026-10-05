import type { HomeScene } from "@habitat/domain";
import {
  recomputeSceneSpaces,
  validateScene,
  validateBaseScene,
  area,
} from "@habitat/geometry";
import { HttpError } from "../../errors";
/** Independent canonical derivation, called within the current-state save transaction. */
export class SpaceTopologyService {
  derive(proposed: HomeScene, previous: HomeScene): HomeScene {
    // Validate wall/host ownership and geometry before trusting it as topology input.
    const wallIds = new Set(
      proposed.floors.flatMap((f) => f.walls.map((w) => w.id)),
    );
    const wallErrors = validateBaseScene(proposed).filter(
      (i) => i.severity === "error" && wallIds.has(i.entityId),
    );
    // Room-side references are rebuilt by derivation; missing hosts and bad walls are not.
    const errors = wallErrors.filter(
      (i) => i.message !== "Wall references missing room",
    );
    if (errors.length)
      throw new HttpError(422, errors.map((i) => i.message).join("; "));
    const result = recomputeSceneSpaces(proposed, previous, true);
    if (result.issues.length)
      throw new HttpError(
        409,
        "Space geometry conflicts with protected architecture",
        result.issues,
      );
    for (const f of result.scene.floors)
      for (const r of f.rooms)
        r.area = r.boundary.length ? area(r.boundary) : null;
    const invalid = validateScene(result.scene).filter(
      (i) => i.severity === "error",
    );
    if (invalid.length)
      throw new HttpError(
        422,
        invalid.map((i) => i.message).join("; "),
        invalid.map((i) => ({
          ...i,
          code: "code" in i ? String(i.code) : "ARCHITECTURE_INVALID",
        })),
      );
    return result.scene;
  }
}
