import type { Project } from "./types";
import { sampleShaders } from "../shaders/preprocess";
export const demoCode = `// MotionScript · code becomes motion
// Coordinates: center origin (0, 0). +X right, +Y up. Time is in seconds.

const x = ease("out", -1200, 0, 0, 1.4, 3, 0);
const opacity = ease("out", 0, 1, 0, 0.9, 2, 0);

// Shader processing is isolated to this group.
group {
    text("HELLO", {
        font: "Inter-Bold",
        position: [x, 150, 0],
        size: 210,
        letterSpacing: -6,
        opacity,
        t1: 0,
        t2: 10,
        color: "#eeeef0"
    });

    text("WORLD", {
        font: "Inter-Bold",
        position: [x, -70, 0],
        size: 132,
        letterSpacing: 12,
        opacity,
        color: "#c5c7ce"
    });

    shader("chromatic.frag", 0.3);
}

rect({
    position: [0, -245, 1],
    width: ease("out", 0, 460, 0.5, 1.8),
    height: 3,
    color: "#c5c7ce"
});

text("WORDS IN MOTION / 001", {
    font: "Inter",
    position: [0, -320, 0],
    size: 26,
    weight: 400,
    letterSpacing: 5,
    color: "#a2a4aa"
});
`;
export function defaultProject(): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: "Words in motion",
    settings: {
      width: 1920,
      height: 1080,
      fps: 60,
      duration: 10,
      background: "#17181b",
      seed: 42,
    },
    code: demoCode,
    assets: [
      ...["Inter", "Inter-Bold"].map((name) => ({
        id: crypto.randomUUID(),
        name,
        aliases: [],
        type: "font" as const,
        originalName: name,
        mimeType: "font/woff2",
        data: "",
        metadata: { builtin: true },
      })),
      ...Object.entries(sampleShaders).map(([name, data]) => ({
        id: crypto.randomUUID(),
        name,
        aliases: [],
        type: "shader" as const,
        originalName: name,
        mimeType: "text/plain",
        data,
        metadata: {},
      })),
    ],
    uniformValues: {},
  };
}

// Only the untouched bundled demo is migrated; user-authored coordinates remain literal.
export const legacyDemoCode =
  '// MotionScript \u00b7 code becomes motion\n// Coordinates: top-left origin. Time is in seconds.\n\nconst x = ease("out", -600, 220, 0, 1.4, 3, 0);\nconst opacity = ease("out", 0, 1, 0, 0.9, 2, 0);\n\n// Shader processing is isolated to this group.\ngroup {\n    text("HELLO", {\n        font: "Inter-Bold",\n        position: [x, 290, 0],\n        size: 210,\n        letterSpacing: -6,\n        opacity,\n        t1: 0,\n        t2: 10,\n        color: "#eeeef0"\n    });\n\n    text("WORLD", {\n        font: "Inter-Bold",\n        position: [x + 8, 545, 0],\n        size: 132,\n        letterSpacing: 12,\n        opacity,\n        color: "#c5c7ce"\n    });\n\n    shader("chromatic.frag", 0.3);\n}\n\nrect({\n    position: [240, 805, 1],\n    width: ease("out", 0, 460, 0.5, 1.8),\n    height: 3,\n    color: "#c5c7ce"\n});\n\ntext("WORDS IN MOTION / 001", {\n    font: "Inter",\n    position: [240, 860, 0],\n    size: 26,\n    weight: 400,\n    letterSpacing: 5,\n    color: "#a2a4aa"\n});\n';

export const downwardDemoCode =
  '// MotionScript \u00b7 code becomes motion\n// Coordinates: center origin (0, 0). +X right, +Y down. Time is in seconds.\n\nconst x = ease("out", -1200, -740, 0, 1.4, 3, 0);\nconst opacity = ease("out", 0, 1, 0, 0.9, 2, 0);\n\n// Shader processing is isolated to this group.\ngroup {\n    text("HELLO", {\n        font: "Inter-Bold",\n        position: [x, -250, 0],\n        size: 210,\n        letterSpacing: -6,\n        opacity,\n        t1: 0,\n        t2: 10,\n        color: "#eeeef0"\n    });\n\n    text("WORLD", {\n        font: "Inter-Bold",\n        position: [x + 8, 5, 0],\n        size: 132,\n        letterSpacing: 12,\n        opacity,\n        color: "#c5c7ce"\n    });\n\n    shader("chromatic.frag", 0.3);\n}\n\nrect({\n    position: [-720, 265, 1],\n    width: ease("out", 0, 460, 0.5, 1.8),\n    height: 3,\n    color: "#c5c7ce"\n});\n\ntext("WORDS IN MOTION / 001", {\n    font: "Inter",\n    position: [-720, 320, 0],\n    size: 26,\n    weight: 400,\n    letterSpacing: 5,\n    color: "#a2a4aa"\n});\n';

export const previousAnchorDemoCode =
  '// MotionScript \u00b7 code becomes motion\n// Coordinates: center origin (0, 0). +X right, +Y up. Time is in seconds.\n\nconst x = ease("out", -1200, -740, 0, 1.4, 3, 0);\nconst opacity = ease("out", 0, 1, 0, 0.9, 2, 0);\n\n// Shader processing is isolated to this group.\ngroup {\n    text("HELLO", {\n        font: "Inter-Bold",\n        position: [x, 250, 0],\n        size: 210,\n        letterSpacing: -6,\n        opacity,\n        t1: 0,\n        t2: 10,\n        color: "#eeeef0"\n    });\n\n    text("WORLD", {\n        font: "Inter-Bold",\n        position: [x + 8, -5, 0],\n        size: 132,\n        letterSpacing: 12,\n        opacity,\n        color: "#c5c7ce"\n    });\n\n    shader("chromatic.frag", 0.3);\n}\n\nrect({\n    position: [-720, -265, 1],\n    width: ease("out", 0, 460, 0.5, 1.8),\n    height: 3,\n    color: "#c5c7ce"\n});\n\ntext("WORDS IN MOTION / 001", {\n    font: "Inter",\n    position: [-720, -320, 0],\n    size: 26,\n    weight: 400,\n    letterSpacing: 5,\n    color: "#a2a4aa"\n});\n';
