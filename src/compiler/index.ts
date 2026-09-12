import { parse, tokenizer } from "acorn";
import { generate } from "astring";
import type { Asset, Diagnostic } from "../project/types";
import { resolveAsset } from "../assets/assets";
import { easeTypes } from "../runtime/ease";
// ESTree nodes retain parser extensions and source positions throughout lowering.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AstNode = any;
export interface CallSite {
  id: string;
  kind: string;
  line: number;
  column: number;
  start: number;
  end: number;
  assetId?: string;
  assetRange?: [number, number];
}
export interface MotionIR {
  version: 1;
  sites: CallSite[];
  dependencies: string[];
  ast: AstNode;
}
export interface Compilation {
  ir: MotionIR | null;
  code: string;
  diagnostics: Diagnostic[];
  compileMs: number;
}
export function lex(
  source: string,
): Array<
  ReturnType<ReturnType<typeof tokenizer>["getToken"]> & { value?: unknown }
> {
  return [...tokenizer(source, { ecmaVersion: "latest", locations: true })];
}
export function parseMotion(source: string): AstNode {
  const tokens = lex(source);
  const groups = new Set<number>();
  let normalized = source;
  for (let i = tokens.length - 2; i >= 0; i--)
    if (tokens[i].value === "group" && tokens[i + 1].type.label === "{") {
      groups.add(tokens[i].start);
      normalized =
        normalized.slice(0, tokens[i].start) +
        "if(1)" +
        normalized.slice(tokens[i].end);
    }
  const ast = parse(normalized, {
    ecmaVersion: "latest",
    locations: true,
    sourceType: "script",
  }) as AstNode;
  walk(ast, (node) => {
    if (node.type === "IfStatement" && groups.has(node.start)) {
      node.type = "GroupStatement";
      node.body = node.consequent;
      delete node.test;
      delete node.consequent;
      delete node.alternate;
    }
  });
  return ast;
}
export function walk(node: AstNode, visitor: (node: AstNode) => void) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc") continue;
    if (Array.isArray(value)) value.forEach((n) => walk(n, visitor));
    else if (value && typeof value === "object") walk(value, visitor);
  }
}
const apis = [
  "text",
  "draw",
  "image",
  "rect",
  "circle",
  "shader",
  "ease",
  "audio",
];
export function compile(source: string, assets: Asset[]): Compilation {
  const started = performance.now(),
    diagnostics: Diagnostic[] = [],
    sites: CallSite[] = [];
  try {
    const ast = parseMotion(source);
    let index = 0;
    const namedShaders = new Map(
      assets
        .filter((a) => a.type === "shader")
        .flatMap((a) =>
          [a.name, ...a.aliases].map(
            (name) => [name.replace(/\.(frag|glsl)$/i, ""), a] as const,
          ),
        ),
    );
    walk(ast, (n) => {
      if (
        n.type === "CallExpression" &&
        n.callee.type === "Identifier" &&
        !apis.includes(n.callee.name)
      ) {
        const asset = namedShaders.get(n.callee.name);
        if (asset) {
          n.callee.name = "shader";
          n.arguments.unshift({
            type: "Literal",
            value: asset.id,
            raw: JSON.stringify(asset.id),
            loc: n.loc,
          });
        }
      }
      if (n.type === "GroupStatement") {
        sites.push({
          id: `group:${n.start}`,
          kind: "group",
          line: n.loc.start.line,
          column: n.loc.start.column + 1,
          start: n.start,
          end: n.end,
        });
        return;
      }
      if (
        n.type !== "CallExpression" ||
        n.callee.type !== "Identifier" ||
        !apis.includes(n.callee.name)
      )
        return;
      const kind = n.callee.name,
        args = n.arguments,
        site: CallSite = {
          id: `${kind}:${n.start}:${index++}`,
          kind,
          line: n.loc.start.line,
          column: n.loc.start.column + 1,
          start: n.start,
          end: n.end,
        };
      sites.push(site);
      n.motionId = site.id;
      const report = (message: string, suggestion?: string) =>
        diagnostics.push({
          severity: "error",
          message,
          line: site.line,
          column: site.column,
          suggestion,
        });
      if (kind === "ease") {
        if (args.length < 5 || args.length > 7)
          report(
            "ease requires 5–7 arguments.",
            'ease("out", 0, 1, 0, 1, 2, 0)',
          );
        if (args[0]?.type === "Literal" && !easeTypes.includes(args[0].value))
          report(`Unknown ease type: ${args[0].value}`, easeTypes.join(", "));
        for (let j = 1; j < args.length; j++)
          if (args[j].type === "Literal" && typeof args[j].value !== "number")
            report(`ease argument ${j + 1} must be a number.`);
        if (
          args[3]?.type === "Literal" &&
          args[4]?.type === "Literal" &&
          args[4].value <= args[3].value
        )
          report("ease end time must be greater than start time.");
        const numValue = (n: AstNode): number | null => {
          if (n?.type === "Literal" && typeof n.value === "number")
            return n.value;
          if (
            n?.type === "UnaryExpression" &&
            n.operator === "-" &&
            n.argument?.type === "Literal" &&
            typeof n.argument.value === "number"
          )
            return -n.argument.value;
          return null;
        };
        if (numValue(args[5]) !== null && numValue(args[5])! <= 0)
          report("ease power must be positive.");
        if (numValue(args[6]) !== null && numValue(args[6])! < 0)
          report("ease speed must be non-negative.");
      }
      if (["text", "draw", "image", "rect", "circle"].includes(kind)) {
        const optionArg =
          args[kind === "text" ? 1 : ["draw", "image"].includes(kind) ? 1 : 0];
        let t1: AstNode, t2: AstNode;
        if (optionArg?.type === "ObjectExpression") {
          t1 = optionArg.properties.find(
            (p: AstNode) => (p.key?.name ?? p.key?.value) === "t1",
          )?.value;
          t2 = optionArg.properties.find(
            (p: AstNode) => (p.key?.name ?? p.key?.value) === "t2",
          )?.value;
          if (
            optionArg.properties.some((p: AstNode) =>
              ["duration", "start"].includes(p.key?.name ?? p.key?.value),
            )
          )
            report(
              "Drawable timing uses t1 and t2.",
              "Replace duration/start with t1: 0, t2: 5.",
            );
        } else {
          const offset =
            kind === "text" ? 6 : ["draw", "image"].includes(kind) ? 5 : 4;
          t1 = args[offset];
          t2 = args[offset + 1];
        }
        if (
          t1?.type === "Literal" &&
          (typeof t1.value !== "number" || t1.value < 0)
        )
          report("t1 must be a non-negative time in seconds.");
        if (t2?.type === "Literal" && typeof t2.value !== "number")
          report("t2 must be an end time in seconds.");
        if (
          t1?.type === "Literal" &&
          t2?.type === "Literal" &&
          t2.value < t1.value
        )
          report("t2 must be greater than or equal to t1.");
      }
      if (["text", "draw", "image", "rect", "circle"].includes(kind)) {
        const options = args[["text", "draw", "image"].includes(kind) ? 1 : 0];
        const anchor =
          options?.type === "ObjectExpression"
            ? options.properties.find((p: AstNode) =>
                ["anchorPoint", "anchor"].includes(p.key?.name ?? p.key?.value),
              )?.value
            : args[
                kind === "text" ? 9 : ["draw", "image"].includes(kind) ? 8 : 7
              ];
        if (
          anchor?.type === "ArrayExpression" &&
          (anchor.elements.length !== 2 ||
            anchor.elements.some(
              (n: AstNode) =>
                !n || (n.type === "Literal" && typeof n.value !== "number"),
            ))
        )
          report("anchorPoint requires two numeric pixel coordinates [x, y].");
        if (anchor?.type === "Literal" || anchor?.type === "ObjectExpression")
          report("anchorPoint must be [x, y], relative to the object center.");
      }
      let arg =
        kind === "text"
          ? args[1]
          : ["draw", "image", "shader", "audio"].includes(kind)
            ? args[0]
            : null;
      if (kind === "text" && arg?.type === "ObjectExpression")
        arg = arg.properties.find(
          (p: AstNode) => p.key?.name === "font" || p.key?.value === "font",
        )?.value;
      if (arg?.type === "Literal" && typeof arg.value === "string") {
        const asset = resolveAsset(assets, arg.value);
        if (!asset)
          report(
            `Media "${arg.value}" was not found.`,
            `Available: ${assets
              .filter((a) =>
                kind === "text"
                  ? a.type === "font"
                  : kind === "shader"
                    ? a.type === "shader"
                    : true,
              )
              .slice(0, 6)
              .map((a) => a.name)
              .join(", ")}`,
          );
        else {
          const valid =
            kind === "text"
              ? asset.type === "font"
              : kind === "shader"
                ? asset.type === "shader"
                : kind === "audio"
                  ? asset.type === "audio"
                  : ["image", "video"].includes(asset.type);
          if (!valid)
            report(
              `"${asset.name}" is ${asset.type}; it cannot be used with ${kind}().`,
            );
          site.assetId = asset.id;
          if (Number.isFinite(arg.start) && Number.isFinite(arg.end))
            site.assetRange = [arg.start, arg.end];
          arg.value = asset.id;
          arg.raw = JSON.stringify(asset.id);
        }
      }
    });
    const ir: MotionIR = {
      version: 1,
      sites,
      dependencies: [
        ...new Set(sites.flatMap((s) => (s.assetId ? [s.assetId] : []))),
      ],
      ast: structuredClone(ast),
    };
    // Lower semantic calls into an explicit runtime ABI. No renderer details enter codegen.
    const lower = (node: AstNode): AstNode => {
      if (!node || typeof node !== "object") return node;
      if (Array.isArray(node)) return node.map(lower);
      if (node.type === "GroupStatement") {
        const body = lower(node.body);
        return {
          type: "ExpressionStatement",
          expression: {
            type: "CallExpression",
            callee: { type: "Identifier", name: "__group" },
            arguments: [
              { type: "Literal", value: `group:${node.start}` },
              { type: "Literal", value: node.loc.start.line },
              {
                type: "ArrowFunctionExpression",
                params: [],
                body,
                expression: false,
                async: false,
              },
            ],
            optional: false,
          },
        };
      }
      const result: AstNode = {};
      for (const [key, val] of Object.entries(node)) {
        if (key === "motionId") continue;
        result[key] = val && typeof val === "object" ? lower(val) : val;
      }
      if (
        node.type === "CallExpression" &&
        node.motionId &&
        node.callee.name !== "ease"
      ) {
        result.callee = { type: "Identifier", name: "__call" };
        result.arguments = [
          { type: "Literal", value: node.motionId },
          { type: "Literal", value: node.callee.name },
          { type: "Literal", value: node.loc.start.line },
          ...result.arguments,
        ];
      }
      const located = (expression: AstNode, line: number): AstNode => ({
        type: "SequenceExpression",
        expressions: [
          {
            type: "CallExpression",
            callee: { type: "Identifier", name: "__loc" },
            arguments: [{ type: "Literal", value: line }],
            optional: false,
          },
          expression,
        ],
      });
      if (node.type === "CallExpression" && node.loc)
        return located(result, node.loc.start.line);
      if (node.type === "VariableDeclarator" && result.init && node.loc)
        result.init = located(result.init, node.loc.start.line);
      return result;
    };
    const code = generate(lower(ast));
    return { ir, code, diagnostics, compileMs: performance.now() - started };
  } catch (error) {
    const e = error as {
      message: string;
      loc?: { line: number; column: number };
    };
    diagnostics.push({
      severity: "error",
      message: e.message,
      line: e.loc?.line ?? 1,
      column: (e.loc?.column ?? 0) + 1,
      suggestion: "Check brackets, quotes, and the current expression.",
    });
    return {
      ir: null,
      code: "",
      diagnostics,
      compileMs: performance.now() - started,
    };
  }
}
export function renameReferences(
  source: string,
  assets: Asset[],
  assetId: string,
  newName: string,
): string {
  const result = compile(source, assets);
  const ranges =
    result.ir?.sites
      .filter((s) => s.assetId === assetId && s.assetRange)
      .map((s) => s.assetRange!) ?? [];
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0]))
    source =
      source.slice(0, start) + JSON.stringify(newName) + source.slice(end);
  return source;
}
