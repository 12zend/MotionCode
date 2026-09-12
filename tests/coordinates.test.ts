import { describe, it, expect } from "vitest";
import {
  projectToClip,
  projectToScreen,
  screenToProject,
} from "../src/runtime/coordinates";
import { compile } from "../src/compiler";
import { createEvaluator } from "../src/runtime/evaluate";
import {
  defaultProject,
  legacyDemoCode,
  demoCode,
} from "../src/project/defaults";
import { deserializeProject } from "../src/project/persistence";
describe("Centered project coordinates", () => {
  it("maps the project origin to the center of the screen and WebGL viewport", () => {
    expect(projectToScreen(0, 0, 1920, 1080)).toEqual({ x: 960, y: 540 });
    const [x, y] = projectToClip(0, 0, 1920, 1080);
    expect(x === 0 && y === 0).toBe(true);
  });
  it("maps corners with positive X right and positive Y up", () => {
    expect(projectToClip(-960, 540, 1920, 1080)).toEqual([-1, 1]);
    expect(projectToClip(960, -540, 1920, 1080)).toEqual([1, -1]);
    expect(screenToProject(0, 0, 1920, 1080)).toEqual({ x: -960, y: 540 });
  });
  it("roundtrips pointer positions at arbitrary resolutions", () => {
    for (const [width, height] of [
      [1920, 1080],
      [1000, 1000],
      [1080, 1920],
    ]) {
      const screen = projectToScreen(-120, 45, width, height);
      expect(screenToProject(screen.x, screen.y, width, height)).toEqual({
        x: -120,
        y: 45,
      });
    }
  });
  it("defaults text and image positions to the centered origin", () => {
    const p = defaultProject(),
      compiled = compile('text("Hello");rect({});', p.assets);
    const scene = createEvaluator(
      compiled.code,
      p.assets,
    )({
      ...p.settings,
      time: 0,
      frame: 0,
      mouse: { x: 0, y: 0 },
      audio: { level: 0, bass: 0, mid: 0, high: 0 },
    });
    expect(scene.nodes.map((n) => n.transform.position)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });
  it("migrates only the untouched legacy demo without rewriting user coordinates", () => {
    const p = defaultProject();
    expect(
      deserializeProject(JSON.stringify({ ...p, code: legacyDemoCode })).code,
    ).toBe(demoCode);
    const custom = "rect({position:[100,100,0]});";
    expect(
      deserializeProject(JSON.stringify({ ...p, code: custom })).code,
    ).toBe(custom);
  });
});
