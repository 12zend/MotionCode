import type { Asset } from "../project/types";
import { compile, parseMotion, walk, type AstNode } from "./index";

/** Change the source expression itself: inspector edits never create hidden animation state. */
export function updateAnchorPoint(
  source: string,
  assets: Asset[],
  nodeId: string,
  anchor: [number, number],
  duration: number,
): string {
  if (!anchor.every(Number.isFinite)) return source;
  const site = compile(source, assets).ir?.sites.find(
    (s) => nodeId === s.id || nodeId.startsWith(`${s.id}:`),
  );
  if (!site) return source;
  let call: AstNode;
  walk(parseMotion(source), (n) => {
    if (n.type === "CallExpression" && n.start === site.start) call = n;
  });
  if (!call) return source;
  const text = `[${anchor[0]}, ${anchor[1]}]`,
    args = call.arguments;
  const kind = call.callee.name;
  const options = args[["text", "draw", "image"].includes(kind) ? 1 : 0];
  const replace = (start: number, end: number, value: string) =>
    source.slice(0, start) + value + source.slice(end);
  if (options?.type === "ObjectExpression") {
    const existing = options.properties.find((p: AstNode) =>
      ["anchorPoint", "anchor"].includes(p.key?.name ?? p.key?.value),
    );
    const laterSpread =
      existing &&
      options.properties.some(
        (p: AstNode) => p.type === "SpreadElement" && p.start > existing.end,
      );
    if (existing && !laterSpread)
      return replace(existing.start, existing.end, `anchorPoint: ${text}`);
    const last = options.properties.at(-1);
    const insertion = last?.end ?? options.start + 1;
    return replace(
      insertion,
      insertion,
      `${last ? ", " : " "}anchorPoint: ${text}`,
    );
  }
  const defaults =
    kind === "text"
      ? [
          '"Hello"',
          '"Inter"',
          "0",
          "0",
          "0",
          "1",
          "0",
          String(duration),
          '"#ffffff"',
        ]
      : ['""', "0", "0", "0", "1", "0", String(duration), '"#ffffff"'];
  const anchorIndex =
    kind === "text" ? 9 : ["rect", "circle"].includes(kind) ? 7 : 8;
  if (["rect", "circle"].includes(kind)) defaults.shift();
  if (args[anchorIndex])
    return replace(args[anchorIndex].start, args[anchorIndex].end, text);
  const missing = defaults.slice(args.length, anchorIndex);
  return replace(
    call.end - 1,
    call.end - 1,
    `${args.length ? ", " : ""}${[...missing, text].join(", ")}`,
  );
}
