/** MotionScript uses a centered origin, +X right, +Y up. */
export function screenToProject(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return { x: x - width / 2, y: height / 2 - y };
}
export function projectToScreen(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return { x: x + width / 2, y: height / 2 - y };
}
export function projectToClip(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  return [(x * 2) / width, (y * 2) / height];
}
