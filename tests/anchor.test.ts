import { describe, it, expect } from "vitest";
import { defaultProject } from "../src/project/defaults";
import { compile } from "../src/compiler";
import { updateAnchorPoint } from "../src/compiler/refactor";
import { createEvaluator } from "../src/runtime/evaluate";
import { drawableGeometry, localToWorld } from "../src/runtime/geometry";
import type { Transform } from "../src/runtime/types";
const project = defaultProject();
const ctx = {
  ...project.settings,
  time: 0,
  frame: 0,
  mouse: { x: 0, y: 0 },
  audio: { level: 0, bass: 0, mid: 0, high: 0 },
};
const transform: Transform = {
  position: [0, 0, 0],
  scale: [1, 1],
  rotation: 0,
  anchorPoint: [0, 0],
  opacity: 1,
  blend: "normal",
};
describe("Centered anchor points", () => {
  it("defaults the pivot to the object center", () => {
    const g = drawableGeometry(100, 60, transform);
    expect(g.bounds).toEqual({ x: -50, y: 30, width: 100, height: 60 });
    expect(localToWorld(0, 0, transform)).toEqual({ x: 0, y: 0 });
  });
  it("maps the chosen local point onto position after scale and rotation", () => {
    const t = {
      ...transform,
      position: [300, -200, 0] as [number, number, number],
      anchorPoint: [30, -15] as [number, number],
      scale: [2, 3] as [number, number],
      rotation: 35,
    };
    expect(localToWorld(30, -15, t)).toEqual({ x: 300, y: -200 });
  });
  it("keeps negative Y pointing down in local coordinates", () => {
    expect(localToWorld(0, -20, transform)).toEqual({ x: 0, y: -20 });
  });
  it("supports object and positional APIs with the same default", () => {
    for (const source of ["rect({});", 'text("A");']) {
      const result = compile(source, project.assets);
      expect(
        createEvaluator(result.code, project.assets)(ctx).nodes[0].transform
          .anchorPoint,
      ).toEqual([0, 0]);
    }
    const result = compile(
      'text("A","Inter",0,0,0,1,0,5,"#ffffff",[20,-30]);',
      project.assets,
    );
    expect(
      createEvaluator(result.code, project.assets)(ctx).nodes[0].transform
        .anchorPoint,
    ).toEqual([20, -30]);
  });
  it("rejects malformed anchor values with source diagnostics", () => {
    expect(
      compile("rect({anchorPoint:[0]});", project.assets).diagnostics[0]
        .message,
    ).toContain("anchorPoint");
    expect(
      compile('rect({anchorPoint:"center"});', project.assets).diagnostics[0]
        .message,
    ).toContain("anchorPoint");
  });
  it("writes inspector edits into object syntax without changing other code", () => {
    const source = '// keep\nrect({width:100, height:200});\ntext("Keep");';
    const result = compile(source, project.assets);
    const id = result.ir!.sites[0].id + ":0";
    const updated = updateAnchorPoint(
      source,
      project.assets,
      id,
      [25, -50],
      10,
    );
    expect(updated).toContain("anchorPoint: [25, -50]");
    expect(updated).toContain("// keep");
    expect(updated).toContain('text("Keep");');
    expect(compile(updated, project.assets).diagnostics).toEqual([]);
  });
  it("updates existing aliases and expands shorthand positional calls", () => {
    for (const source of [
      'text("A");',
      'text("A", {anchor:[1,2]});',
      'rect(0,0,0,1,0,5,"#ffffff");',
    ]) {
      const id = compile(source, project.assets).ir!.sites[0].id + ":0";
      const updated = updateAnchorPoint(
        source,
        project.assets,
        id,
        [10, -20],
        7,
      );
      const result = compile(updated, project.assets);
      expect(result.diagnostics).toEqual([]);
      expect(
        createEvaluator(result.code, project.assets)(ctx).nodes[0].transform
          .anchorPoint,
      ).toEqual([10, -20]);
    }
  });
});

it("inspector anchors override spread options in source order", () => {
  const source = "const options={anchorPoint:[1,2]};rect({...options});";
  const id = compile(source, project.assets).ir!.sites[0].id + ":0";
  const updated = updateAnchorPoint(source, project.assets, id, [30, -40], 10);
  expect(
    createEvaluator(compile(updated, project.assets).code, project.assets)(ctx)
      .nodes[0].transform.anchorPoint,
  ).toEqual([30, -40]);
});
