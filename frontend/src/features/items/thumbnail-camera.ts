import { Box3, PerspectiveCamera, Vector3 } from "three";
// Camera is on +X/+Z, above the product: the same three-quarter convention as ModelPreview.
export function fitCameraToObject(bounds: Box3, aspect = 1, padding = 1.15) {
  if (
    bounds.isEmpty() ||
    ![...bounds.min.toArray(), ...bounds.max.toArray(), aspect, padding].every(
      Number.isFinite,
    ) ||
    aspect <= 0 ||
    padding < 1
  )
    throw new Error("Invalid model bounds");
  const center = bounds.getCenter(new Vector3()),
    size = bounds.getSize(new Vector3());
  if (size.length() === 0) throw new Error("Empty model bounds");
  const direction = new Vector3(4, 3, 5).normalize(),
    right = new Vector3(0, 1, 0).cross(direction).normalize(),
    up = direction.clone().cross(right);
  const camera = new PerspectiveCamera(42, aspect);
  const tanY = Math.tan((camera.fov * Math.PI) / 360),
    tanX = tanY * aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new Vector3(x, y, z).sub(center),
          depth = offset.dot(direction);
        distance = Math.max(
          distance,
          depth + (padding * Math.abs(offset.dot(right))) / tanX,
          depth + (padding * Math.abs(offset.dot(up))) / tanY,
        );
      }
  const radius = size.length() / 2;
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.000001, (distance - radius) * 0.1);
  camera.far = distance + radius * 3;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
