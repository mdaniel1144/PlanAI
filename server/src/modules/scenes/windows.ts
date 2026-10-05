import type { HomeScene } from "@habitat/domain";
import { validateWindows } from "@habitat/geometry";
import { HttpError } from "../../errors";
/** One opening and its assembly are validated before the containing transaction writes. */
export class WindowService {
  validate(scene: HomeScene) {
    const issues = validateWindows(scene).filter((i) => i.severity === "error");
    if (issues.length)
      throw new HttpError(
        422,
        issues.map((i) => `${i.code}: ${i.message}`).join("; "),
        issues,
      );
  }
}
