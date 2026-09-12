export const easeTypes = [
  "in",
  "out",
  "inout",
  "circin",
  "circout",
  "circinout",
  "expoin",
  "expoout",
  "expoinout",
] as const;
export type EaseType = (typeof easeTypes)[number];
/** Explicit time makes scrubbing and export independent of playback history. */
export function easeAt(
  time: number,
  type: EaseType,
  v0: number,
  v1: number,
  t0: number,
  t1: number,
  power = 2,
  speed = 0,
): number {
  if (!easeTypes.includes(type)) throw new Error(`Unknown ease type "${type}"`);
  if (
    ![time, v0, v1, t0, t1, power, speed].every(Number.isFinite) ||
    t1 <= t0 ||
    power <= 0 ||
    speed < 0
  )
    throw new Error(
      "ease: use finite values, t1 > t0, power > 0 and speed >= 0.",
    );
  const t = Math.max(0, Math.min(1, (time - t0) / (t1 - t0)));
  let v = t;
  switch (type) {
    case "in":
      v = t ** power;
      break;
    case "out":
      v = 1 - (1 - t) ** power;
      break;
    case "inout":
      v = t < 0.5 ? (2 * t) ** power / 2 : 1 - (2 * (1 - t)) ** power / 2;
      break;
    case "circin":
      v = 1 - Math.sqrt(1 - t * t);
      break;
    case "circout":
      v = Math.sqrt(1 - (t - 1) ** 2);
      break;
    case "circinout":
      v =
        t < 0.5
          ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
          : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;
      break;
    case "expoin":
      v = t === 0 ? 0 : 2 ** (10 * t - 10);
      break;
    case "expoout":
      v = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      break;
    case "expoinout":
      v =
        t === 0
          ? 0
          : t === 1
            ? 1
            : t < 0.5
              ? 2 ** (20 * t - 10) / 2
              : (2 - 2 ** (-20 * t + 10)) / 2;
      break;
  }
  // Speed adds an elastic oscillation to the remaining distance.
  // With speed 0, cos(0) is 1, so this reduces exactly to the base easing.
  const elapsed = Math.max(0, time - t0);
  v += (1 - Math.cos(elapsed * speed)) * (1 - v);
  return v0 + (v1 - v0) * v;
}
export function parseColor(
  input: string,
): [number, number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/i.test(input)) return null;
  return [
    parseInt(input.slice(1, 3), 16) / 255,
    parseInt(input.slice(3, 5), 16) / 255,
    parseInt(input.slice(5, 7), 16) / 255,
    1,
  ];
}
