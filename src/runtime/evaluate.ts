import type { Asset, Project } from "../project/types";
import type { FrameContext, SceneFrame, SceneNode, Transform } from "./types";
import { easeAt, type EaseType } from "./ease";
import { resolveAsset } from "../assets/assets";
import { preprocessShader } from "../shaders/preprocess";
const transform = (o: Record<string, unknown> = {}): Transform => ({
  position: (o.position ?? [0, 0, 0]) as Transform["position"],
  scale: Array.isArray(o.scale)
    ? (o.scale as [number, number])
    : [Number(o.scale ?? 1), Number(o.scale ?? 1)],
  rotation: Number(o.rotation ?? 0),
  anchorPoint: (o.anchorPoint ?? o.anchor ?? [0, 0]) as [number, number],
  opacity: Number(o.opacity ?? 1),
  blend: (o.blend ?? "normal") as Transform["blend"],
});
export function createEvaluator(code: string, assets: Asset[]) {
  // User JavaScript runs only inside a disposable Worker in the IDE. Pure entry point also enables tests.
  const execute = new Function(
    "time",
    "frame",
    "fps",
    "width",
    "height",
    "resolution",
    "mouse",
    "audio",
    "ease",
    "__call",
    "__group",
    "random",
    "Math",
    "__loc",
    code,
  );
  return (
    ctx: FrameContext,
    uniformValues: Project["uniformValues"] = {},
  ): SceneFrame => {
    const root: SceneNode = {
      id: "root",
      kind: "group",
      line: 1,
      transform: transform(),
      t1: 0,
      t2: ctx.duration,
      color: "#ffffff",
      children: [],
      shaders: [],
    };
    let currentLine = 1;
    let parent = root;
    let count = 0;
    const instances = new Map<string, number>();
    const audioRequests: SceneFrame["audioRequests"] = [];
    const asset = (name: string) => {
      const a = resolveAsset(assets, name);
      if (!a) throw new Error(`Media "${name}" was not found.`);
      return a;
    };
    const group = (id: string, line: number, body: () => void) => {
      const n: SceneNode = {
        id: `${id}:${count++}`,
        kind: "group",
        line,
        transform: transform(),
        t1: 0,
        t2: ctx.duration,
        color: "#ffffff",
        children: [],
        shaders: [],
      };
      parent.children!.push(n);
      const previous = parent;
      parent = n;
      try {
        body();
        if (n.children!.length) {
          n.t1 = Math.min(...n.children!.map((child) => child.t1));
          n.t2 = Math.max(...n.children!.map((child) => child.t2));
        }
      } finally {
        parent = previous;
      }
    };
    const call = (
      id: string,
      kind: string,
      line: number,
      ...args: unknown[]
    ) => {
      if (++count > 10000)
        throw new Error(`Line ${line}: scene exceeds 10,000 nodes.`);
      if (kind === "shader") {
        const a = asset(String(args[0]));
        const defs = preprocessShader(a.data).uniforms;
        const values: Record<string, number | number[] | boolean> =
          typeof args[1] === "object" && !Array.isArray(args[1])
            ? (args[1] as Record<string, number | number[] | boolean>)
            : Object.fromEntries(
                defs.map((u, i) => [
                  u.name,
                  (args[i + 1] ?? u.defaultValue) as
                    number | number[] | boolean,
                ]),
              );
        parent.shaders.push({
          assetId: a.id,
          uniforms: { ...values, ...uniformValues[a.id] },
        });
        return;
      }
      if (kind === "audio") {
        audioRequests.push({
          assetId: asset(String(args[0])).id,
          volume: Number(args[1] ?? 1),
          start: Number(args[2] ?? 0),
        });
        return;
      }
      const isText = kind === "text";
      let options: Record<string, unknown> = {};
      let source: Asset | undefined;
      const optionsIndex = isText
        ? 1
        : kind === "draw" || kind === "image"
          ? 1
          : 0;
      if (
        args[optionsIndex] &&
        typeof args[optionsIndex] === "object" &&
        !Array.isArray(args[optionsIndex])
      )
        options = args[optionsIndex] as Record<string, unknown>;
      else {
        const offset = isText ? 2 : kind === "draw" || kind === "image" ? 1 : 0;
        options = {
          position: [
            Number(args[offset] ?? 0),
            Number(args[offset + 1] ?? 0),
            Number(args[offset + 2] ?? 0),
          ],
          scale: args[offset + 3] ?? 1,
          t1: args[offset + 4] ?? 0,
          t2: args[offset + 5] ?? ctx.duration,
          color: args[offset + 6] ?? "#ffffff",
          anchorPoint: args[offset + 7] ?? [0, 0],
        };
        if (isText) options.font = args[1] ?? "Inter";
      }
      if (kind === "draw" || kind === "image") source = asset(String(args[0]));
      if (isText && options.font) source = asset(String(options.font));
      const anchorPoint = options.anchorPoint ?? options.anchor ?? [0, 0];
      if (
        !Array.isArray(anchorPoint) ||
        anchorPoint.length !== 2 ||
        !anchorPoint.every((v) => typeof v === "number" && Number.isFinite(v))
      )
        throw new Error(
          "anchorPoint requires two finite pixel coordinates [x, y].",
        );
      const iteration = instances.get(id) ?? 0;
      instances.set(id, iteration + 1);
      const n: SceneNode = {
        id: `${id}:${iteration}`,
        kind: isText
          ? "text"
          : kind === "image"
            ? "draw"
            : (kind as SceneNode["kind"]),
        line,
        transform: transform(options),
        t1: Number(options.t1 ?? 0),
        t2: Number(options.t2 ?? ctx.duration),
        color: String(options.color ?? "#ffffff"),
        text: isText ? String(args[0]) : undefined,
        assetId: source?.id,
        font: source?.name ?? "Inter",
        size: Number(options.size ?? 120),
        weight: Number(options.weight ?? 700),
        letterSpacing: Number(options.letterSpacing ?? 0),
        stroke: Number(options.stroke ?? 0),
        width: Number(options.width ?? 200),
        height: Number(options.height ?? 200),
        shaders: [],
      };
      if (
        !Number.isFinite(n.t1) ||
        !Number.isFinite(n.t2) ||
        n.t1 < 0 ||
        n.t2 < n.t1
      )
        throw new Error(`Line ${line}: use a valid interval 0 <= t1 <= t2.`);
      parent.children!.push(n);
      return n;
    };
    let seed = ctx.seed | 0;
    const random = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const math = Object.create(Math);
    math.random = random;
    const audio = Object.assign(
      (name: string, volume = 1, start = 0) =>
        call("audio", "audio", 1, name, volume, start),
      ctx.audio,
    );
    try {
      execute(
        ctx.time,
        ctx.frame,
        ctx.fps,
        ctx.width,
        ctx.height,
        [ctx.width, ctx.height],
        ctx.mouse,
        audio,
        (
          type: EaseType,
          ...v: [number, number, number, number, number?, number?]
        ) => easeAt(ctx.time, type, ...v),
        call,
        group,
        random,
        math,
        (line: number) => {
          currentLine = line;
        },
      );
    } catch (error) {
      throw new Error(
        `Line ${currentLine}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return {
      nodes: root.shaders.length ? [root] : root.children!,
      audioRequests,
    };
  };
}
