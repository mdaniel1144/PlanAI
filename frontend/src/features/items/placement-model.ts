import { Mesh, Vector3 } from "three";
import type { Item, ItemVariant, Point } from "@habitat/domain";
import { loadModel, cloneModel, applyVariant } from "./model-cache";
import { calibratedModel } from "./model-transform";

// Derived presentation only. The product's verified dimensions remain canonical.
const footprints = new Map<string, Point[]>();
export async function preparePlacement(item: Item, variant: ItemVariant) {
  const asset = item.assets.find((a) => a.id === item.baseModelAssetId);
  if (!asset?.calibration || !item.dimensions)
    throw new Error("This item has no verified runtime model.");
  const source = await loadModel(asset.id);
  const owned = cloneModel(source);
  try {
    // Validate selected appearance as well as geometry before allowing a click.
    await applyVariant(owned, item, variant);
    const key = `${asset.id}:${JSON.stringify(asset.calibration)}`;
    const cached = footprints.get(key);
    if (cached) return cached;
    const model = calibratedModel(owned.scene, asset);
    const vertices: Point[] = [];
    const v = new Vector3();
    // Project actual geometry onto the plan. A convex outline is suitable for
    // furniture selection/placement, and doesn't invent a second image asset.
    model.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute("position");
      if (!positions) return;
      for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
        vertices.push({ x: v.x, y: -v.z });
      }
    });
    vertices.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (a: Point, b: Point, c: Point) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const half = (points: Point[]) => {
      const hull: Point[] = [];
      for (const p of points) {
        while (hull.length >= 2 && cross(hull.at(-2)!, hull.at(-1)!, p) <= 0)
          hull.pop();
        hull.push(p);
      }
      return hull;
    };
    const lower = half(vertices),
      upper = half([...vertices].reverse());
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    const outline =
      hull.length >= 3
        ? hull
        : [
            { x: -item.width! / 2, y: -item.depth! / 2 },
            { x: item.width! / 2, y: -item.depth! / 2 },
            { x: item.width! / 2, y: item.depth! / 2 },
            { x: -item.width! / 2, y: item.depth! / 2 },
          ];
    footprints.set(key, outline);
    if (footprints.size > 64)
      footprints.delete(footprints.keys().next().value!);
    return outline;
  } finally {
    owned.dispose();
  }
}
