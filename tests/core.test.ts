import { describe, it, expect } from "vitest";
import { lex, parseMotion, compile, renameReferences } from "../src/compiler";
import { easeAt, easeTypes, parseColor } from "../src/runtime/ease";
import { createEvaluator } from "../src/runtime/evaluate";
import { defaultProject } from "../src/project/defaults";
import {
  serializeProject,
  deserializeProject,
} from "../src/project/persistence";
import { preprocessShader, sampleShaders } from "../src/shaders/preprocess";
import { resolveAsset } from "../src/assets/assets";
import { contextAt } from "../src/editor/language";
const project = defaultProject();
const ctx = {
  time: 0.5,
  frame: 30,
  fps: 60,
  width: 1920,
  height: 1080,
  duration: 10,
  seed: 42,
  mouse: { x: 0, y: 0 },
  audio: { level: 0, bass: 0.5, mid: 0, high: 0 },
};
describe("Lexer and extended AST", () => {
  it("preserves comments, strings, numbers and source coordinates", () => {
    const tokens = lex('// comment\ntext("HELLO", 1);');
    expect(tokens[0].value).toBe("text");
    expect(tokens[0].loc?.start.line).toBe(2);
    expect(tokens[2].value).toBe("HELLO");
  });
  it("parses nested groups without rewriting string or comment content", () => {
    const ast = parseMotion(
      'const s = "group {"; // group {\ngroup { group { text(s); } }',
    );
    expect(ast.body[1].type).toBe("GroupStatement");
    expect(ast.body[1].body.body[0].type).toBe("GroupStatement");
    expect(ast.body[1].loc.start).toMatchObject({ line: 2, column: 0 });
  });
  it("recovers from unfinished source by returning diagnostics instead of throwing", () => {
    const result = compile('text("HELLO"', project.assets);
    expect(result.ir).toBeNull();
    expect(result.diagnostics[0].line).toBe(1);
    expect(compile('text("HELLO");', project.assets).diagnostics).toEqual([]);
  });
});
describe("Semantic analysis and UUID resolution", () => {
  it("resolves font literal in positional and object forms", () => {
    const result = compile(
      'text("Hi", "Inter"); text("Hi", {font:"Inter"});',
      project.assets,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.dependencies).toEqual([project.assets[0].id]);
    expect(result.code).toContain(project.assets[0].id);
  });
  it("reports unknown assets and incompatible asset types", () => {
    expect(
      compile('draw("missing.png");', project.assets).diagnostics[0].message,
    ).toContain("was not found");
    expect(
      compile('draw("Inter");', project.assets).diagnostics[0].message,
    ).toContain("cannot be used");
  });
  it("refactors only asset references and preserves UUID identity", () => {
    const source = 'text("Inter", "Inter");';
    const renamed = renameReferences(
      source,
      project.assets,
      project.assets[0].id,
      "NewFont",
    );
    expect(renamed).toBe('text("Inter", "NewFont");');
    const assets = project.assets.map((a, i) =>
      i ? a : { ...a, name: "NewFont", aliases: ["Inter"] },
    );
    expect(resolveAsset(assets, "Inter")?.id).toBe(project.assets[0].id);
  });
  it("validates ease literal arguments", () => {
    for (const code of [
      'ease("bad",0,1,0,1);',
      'ease("out",0,1,1,0);',
      'ease("out",0,1,0,1,0);',
      'ease("out",0,"x",0,1);',
      'ease("out",0,1,0,1,2,-1);',
    ])
      expect(compile(code, project.assets).diagnostics.length).toBeGreaterThan(
        0,
      );
    expect(
      compile('ease("out",0,1,0,1,2,0);', project.assets).diagnostics,
    ).toEqual([]);
  });
});
describe("Easing and color", () => {
  it.each(easeTypes)("%s reaches both endpoints", (type) => {
    expect(easeAt(0, type, 10, 20, 0, 1)).toBe(10);
    expect(easeAt(1, type, 10, 20, 0, 1)).toBe(20);
  });
  it("clamps project time, ignores power for expo and adds elastic with speed", () => {
    expect(easeAt(-5, "out", 0, 1, 0, 1)).toBe(0);
    expect(easeAt(-5, "out", 0, 1, 0, 1, 2, 100)).toBe(0);
    expect(easeAt(0.5, "expoin", 0, 1, 0, 1, 2)).toBe(
      easeAt(0.5, "expoin", 0, 1, 0, 1, 8),
    );
    expect(easeAt(0.35, "out", 0, 1, 0, 1, 2, 0)).toBe(
      easeAt(0.35, "out", 0, 1, 0, 1, 2, 0),
    );
    expect(easeAt(0.35, "out", 0, 1, 0, 1, 2, 0)).not.toBe(
      easeAt(0.35, "out", 0, 1, 0, 1, 2, 3),
    );
    expect(easeAt(0, "circout", 0, -90, 0.4, 1.5, 3, 100)).toBe(0);
    expect(easeAt(0.4, "circout", 0, -90, 0.4, 1.5, 3, 100)).toBe(0);
    expect(easeAt(1.5, "circout", 0, -90, 0.4, 1.5, 3, 100)).toBe(-90);
  });
  it("accepts only exact hex RGB colors", () => {
    expect(parseColor("#ff0044")).toEqual([1, 0, 68 / 255, 1]);
    for (const c of ["#fff", "#gg0000", "ff0044", "#ff004400"])
      expect(parseColor(c)).toBeNull();
  });
});
describe("Shader preprocessing", () => {
  it("reflects typed uniforms and metadata", () => {
    const p = preprocessShader(
      "@range(-1, 3)\nuniform float intensity;\nuniform vec3 color;\nuniform bool enabled;\nvoid main(image){return vec3(1.); }",
    );
    expect(p.uniforms[0]).toMatchObject({ name: "intensity", min: -1, max: 3 });
    expect(p.uniforms[1].defaultValue).toEqual([1, 1, 1]);
    expect(p.source).not.toContain("@range");
  });
  it("adapts both texture2D call forms and preserves helper returns", () => {
    const p = preprocessShader(
      "vec3 helper(){return vec3(1.);}\nvoid main(image){vec4 a=texture2D(image, uv);vec4 b=texture2D(image, u, v);return a.rgb;}",
    );
    expect(p.source).toContain("motionTexture(u_image, uv)");
    expect(p.source).toContain("motionTexture(u_image, vec2(u, v))");
    expect(p.source).toContain("vec3 helper(){return vec3(1.);}");
    expect(p.source).toContain("outColor = vec4(motionMain()");
  });
  it.each(Object.keys(sampleShaders))("preprocesses %s", (name) => {
    const p = preprocessShader(sampleShaders[name]);
    expect(p.source.startsWith("#version 300 es")).toBe(true);
    expect(p.source).not.toContain("void main(image)");
  });
});
describe("MotionScript → AST → IR → JavaScript → scene integration", () => {
  it("runs functions, loops, conditionals, objects and audio-reactive transforms", () => {
    const source =
      'function scene(){for(let i=0;i<3;i++){if(i<3) text("A"+i,{font:"Inter",position:[i*100,200,0],scale:1+audio.bass});}} group {scene(); shader("glitch.frag",{amount:0.8,speed:2});}';
    const result = compile(source, project.assets);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.sites.some((s) => s.kind === "group")).toBe(true);
    const scene = createEvaluator(result.code, project.assets)(ctx);
    expect(scene.nodes[0].children).toHaveLength(3);
    expect(scene.nodes[0].children?.[2].transform.position[0]).toBe(200);
    expect(scene.nodes[0].children?.[0].transform.scale).toEqual([1.5, 1.5]);
    expect(scene.nodes[0].shaders[0].uniforms.amount).toBe(0.8);
    expect(new Set(scene.nodes[0].children?.map((n) => n.id)).size).toBe(3);
  });
  it("isolates shader passes to their group", () => {
    const result = compile(
      'group {text("A");shader("gradient.frag");}text("B");',
      project.assets,
    );
    const scene = createEvaluator(result.code, project.assets)(ctx);
    expect(scene.nodes[0].shaders).toHaveLength(1);
    expect(scene.nodes[1].shaders).toHaveLength(0);
  });
  it("supports bare assignment and deterministic random at explicit times", () => {
    const c = compile(
      'x = ease("out",0,500,0,1); text(String(random()), {position:[x,0,0]});',
      project.assets,
    );
    const run = createEvaluator(c.code, project.assets);
    expect(run(ctx)).toEqual(run(ctx));
    expect(run(ctx).nodes[0].transform.position[0]).toBe(375);
  });
  it("executes the bundled demo", () => {
    const result = compile(project.code, project.assets);
    expect(result.diagnostics).toEqual([]);
    const frame = createEvaluator(
      result.code,
      project.assets,
    )({ ...ctx, time: 1.8 });
    expect(frame.nodes).toHaveLength(3);
    expect(frame.nodes[0].children?.[0].text).toBe("HELLO");
  });
});
describe("Portable project serialization", () => {
  it("roundtrips embedded binary data, shaders, settings and IDs", () => {
    const p = {
      ...project,
      assets: [
        ...project.assets,
        {
          id: "image-id",
          name: "hero.png",
          aliases: [],
          type: "image" as const,
          originalName: "hero.png",
          mimeType: "image/png",
          data: "data:image/png;base64,aGVsbG8=",
          metadata: {},
        },
      ],
    };
    expect(deserializeProject(serializeProject(p))).toEqual(p);
  });
  it("rejects future versions and invalid settings", () => {
    expect(() => deserializeProject('{"version":2}')).toThrow("version");
    expect(() =>
      deserializeProject(
        JSON.stringify({
          ...project,
          settings: { ...project.settings, width: -1 },
        }),
      ),
    ).toThrow("width");
  });
});
describe("Context-aware completion", () => {
  it("tracks nested calls and skips commas inside strings", () => {
    expect(contextAt('text("Hello, world", ')).toMatchObject({
      name: "text",
      index: 1,
    });
    expect(contextAt('text("Hi", "Inter", ease(')).toMatchObject({
      name: "ease",
      index: 0,
    });
    expect(contextAt("draw(")).toMatchObject({ name: "draw", index: 0 });
  });
});

describe("Drawable t1–t2 intervals", () => {
  it("lowers positional text and draw intervals as absolute times", () => {
    const result = compile(
      'text("A","Inter",100,200,0,1,2,5,"#ffffff");',
      project.assets,
    );
    expect(result.diagnostics).toEqual([]);
    const n = createEvaluator(result.code, project.assets)(ctx).nodes[0];
    expect(n.t1).toBe(2);
    expect(n.t2).toBe(5);
    expect(n).not.toHaveProperty("duration");
  });
  it("uses t1/t2 in object syntax and rejects reversed intervals", () => {
    const result = compile("rect({t1:3,t2:8});", project.assets);
    const n = createEvaluator(result.code, project.assets)(ctx).nodes[0];
    expect([n.t1, n.t2]).toEqual([3, 8]);
    expect(
      compile('text("A","Inter",0,0,0,1,5,2,"#ffffff");', project.assets)
        .diagnostics[0].message,
    ).toContain("t2");
    expect(
      compile("rect({duration:3});", project.assets).diagnostics[0].message,
    ).toContain("t1 and t2");
  });
});

describe("Source mapping and shader call ABI", () => {
  it("maps a runtime error to its original MotionScript line", () => {
    const result = compile(
      "const valid = 1;\n\ntext(missingValue);",
      project.assets,
    );
    expect(() => createEvaluator(result.code, project.assets)(ctx)).toThrow(
      "Line 3:",
    );
  });
  it("calls GLSL assets as named functions", () => {
    const result = compile(
      'group { text("A"); glitch(0.8, 2); }',
      project.assets,
    );
    expect(result.diagnostics).toEqual([]);
    const frame = createEvaluator(result.code, project.assets)(ctx);
    expect(frame.nodes[0].shaders[0].uniforms).toEqual({
      amount: 0.8,
      speed: 2,
    });
  });
  it("declares standard uniforms even when used at statement endings", () => {
    const shader = preprocessShader(
      "void main(image) { vec2 uv = u_pixel / u_resolution; return vec3(uv, 1.0); }",
    );
    expect(shader.source).toContain("uniform vec2 u_resolution;");
  });
});
