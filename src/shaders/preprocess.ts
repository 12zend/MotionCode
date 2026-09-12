export interface Uniform {
  name: string;
  type: string;
  defaultValue: number | number[] | boolean;
  min: number;
  max: number;
}
export interface ProcessedShader {
  source: string;
  uniforms: Uniform[];
  lineOffset: number;
}
/** Reflection and syntax adaptation stay separate from GPU compilation. */
export function preprocessShader(input: string): ProcessedShader {
  const clean = input
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
  const uniforms: Uniform[] = [];
  const regex =
    /(?:@range\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)\s*)?uniform\s+(float|int|bool|vec[234])\s+(\w+)\s*;/g;
  for (const m of clean.matchAll(regex)) {
    if (m[4].startsWith("u_")) continue;
    const n = Number(m[3].slice(-1));
    uniforms.push({
      name: m[4],
      type: m[3],
      defaultValue:
        m[3] === "bool"
          ? false
          : m[3].startsWith("vec")
            ? Array(n).fill(1)
            : 0.5,
      min: m[1] ? Number(m[1]) : 0,
      max: m[2] ? Number(m[2]) : 2,
    });
  }
  let source = input
    .replace(/^\s*#version[^\n]*\n?/m, "")
    .replace(/@(?:range|ui|slider|color)(?:\([^)]*\))?/g, "");
  const friendly = /void\s+main\s*\(\s*image\s*\)/.test(source);
  source = source
    .replace(
      /\btexture2D\s*\(\s*image\s*,\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/g,
      "texture(u_image, vec2($1, $2))",
    )
    .replace(/\btexture2D\s*\(/g, "texture(");
  if (friendly) {
    source = source
      .replace(/void\s+main\s*\(\s*image\s*\)/, "vec3 motionMain()")
      .replace(/\bimage\b/g, "u_image")
      .replace(/\btexture\s*\(/g, "motionTexture(");
    source +=
      "\nvoid main() { float alpha = texture(u_image, gl_FragCoord.xy / _motion_resolution).a; outColor = vec4(motionMain() * alpha, alpha); }";
  }
  const declarations = [
    "precision highp float;",
    "uniform vec2 u_resolution;",
    "uniform vec2 _motion_resolution;",
    "uniform float u_time;",
    "uniform vec2 u_mouse;",
    "uniform sampler2D u_image;",
    "out vec4 outColor;",
  ].filter(
    (s) =>
      !new RegExp(s.replace(/ /g, "\\s+").replace(";", "\\s*;")).test(source),
  );
  const header =
    "#version 300 es\n" +
    declarations.join("\n") +
    "\n#define u_pixel ((gl_FragCoord.xy / _motion_resolution - vec2(0.5)) * u_resolution)\n" +
    (friendly
      ? "vec4 motionTexture(sampler2D inputTexture, vec2 uv) { vec4 value = texture(inputTexture, uv); return vec4(value.rgb / max(value.a, 0.00001), value.a); }\n"
      : "");
  return {
    source: header + source,
    uniforms,
    lineOffset: header.split("\n").length - 1,
  };
}
export const sampleShaders: Record<string, string> = {
  "gradient.frag": `void main(image) {\n    vec2 uv = u_pixel / u_resolution + vec2(0.5);\n    return vec3(uv.x, uv.y, 1.0);\n}`,
  "noise.frag": `uniform float intensity;\nvoid main(image) {\n    vec2 uv = u_pixel / u_resolution + vec2(0.5);\n    vec3 source = texture2D(image, uv).rgb;\n    float n = fract(sin(dot(floor(u_pixel), vec2(12.9898,78.233)) + u_time) * 43758.5453);\n    return source + (n - 0.5) * intensity;\n}`,
  "glitch.frag": `uniform float amount;\nuniform float speed;\nvoid main(image) {\n    vec2 uv = u_pixel / u_resolution + vec2(0.5);\n    float stripe = step(0.94, sin(uv.y * 160.0 + floor(u_time * speed * 12.0)));\n    uv.x += stripe * amount * 0.025;\n    return texture2D(image, uv).rgb;\n}`,
  "chromatic.frag": `uniform float intensity;\nvoid main(image) {\n    vec2 uv = u_pixel / u_resolution + vec2(0.5);\n    vec2 offset = vec2(intensity * 0.009, 0.0);\n    return vec3(texture2D(image, uv + offset).r, texture2D(image, uv).g, texture2D(image, uv - offset).b);\n}`,
};

export const legacyShaderSources = Object.fromEntries(
  Object.entries(sampleShaders).map(([name, source]) => [
    name,
    source.replaceAll(
      "u_pixel / u_resolution + vec2(0.5)",
      "u_pixel / u_resolution",
    ),
  ]),
);
