import type { Transform } from "./types";
export interface Point {
  x: number;
  y: number;
}
/** Local coordinates are pixels from the object center, +Y up, before scale/rotation. */
export function localToWorld(
  x: number,
  y: number,
  transform: Transform,
): Point {
  const dx = (x - transform.anchorPoint[0]) * transform.scale[0];
  const dy = (y - transform.anchorPoint[1]) * transform.scale[1];
  const angle = (transform.rotation * Math.PI) / 180;
  return {
    x: transform.position[0] + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: transform.position[1] + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}
export function drawableGeometry(
  width: number,
  height: number,
  transform: Transform,
) {
  const corners = [
    [-width / 2, height / 2],
    [width / 2, height / 2],
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
  ].map(([x, y]) => localToWorld(x, y, transform));
  const left = Math.min(...corners.map((p) => p.x)),
    right = Math.max(...corners.map((p) => p.x));
  const top = Math.max(...corners.map((p) => p.y)),
    bottom = Math.min(...corners.map((p) => p.y));
  return {
    corners,
    bounds: { x: left, y: top, width: right - left, height: top - bottom },
  };
}
