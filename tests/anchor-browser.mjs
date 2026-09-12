import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
  canvas = page.locator('canvas[aria-label="Motion preview"]');
const pixel = (x, y) =>
  canvas.evaluate(
    (c, { x, y }) => {
      const gl = c.getContext("webgl2"),
        p = new Uint8Array(4);
      gl.readPixels(
        Math.floor(x * c.width),
        Math.floor((1 - y) * c.height - 1),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p,
      );
      return [...p];
    },
    { x, y },
  );
const store = (fn) =>
  page.evaluate(async (fn) => {
    const url = performance
      .getEntriesByType("resource")
      .find((e) => e.name.includes("/src/project/store.ts")).name;
    return new Function("s", `return (${fn})(s)`)(
      (await import(url)).useStore.getState(),
    );
  }, fn.toString());
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForSelector(".monaco-editor");
  await page.waitForTimeout(1300);
  const p = await store((s) => s.project);
  p.code = 'rect({width:200,height:100,color:"#ffffff"});';
  const load = async () => {
    await page
      .getByTestId("project-input")
      .setInputFiles({
        name: "anchor.motion",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
    await page.waitForTimeout(1100);
  };
  await load();
  let box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page
    .locator(".view-menu")
    .getByRole("button", { name: "Properties", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Anchor X", exact: true })
      .inputValue(),
    "0",
  );
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Anchor Y", exact: true })
      .inputValue(),
    "0",
  );
  assert((await pixel(0.46, 0.5))[0] > 245);
  console.log("PASS Default anchor [0,0] is the object center");
  await page
    .getByRole("button", { name: "Anchor top left", exact: true })
    .click();
  await page.waitForTimeout(900);
  assert(
    (await store((s) => s.project.code)).includes("anchorPoint: [-100, 50]"),
  );
  assert((await pixel(0.46, 0.5))[0] < 80);
  assert((await pixel(0.54, 0.53))[0] > 245);
  console.log(
    "PASS Presets write pixel anchor coordinates into source and update the preview",
  );
  await page
    .getByRole("button", { name: "Anchor center", exact: true })
    .click();
  await page.waitForTimeout(700);
  await page
    .getByRole("spinbutton", { name: "Anchor X", exact: true })
    .fill("40");
  await page
    .getByRole("spinbutton", { name: "Anchor Y", exact: true })
    .fill("-20");
  await page.waitForTimeout(1000);
  assert(
    (await store((s) => s.project.code)).includes("anchorPoint: [40, -20]"),
  );
  console.log("PASS Numeric anchor editing preserves both axes and negative Y");
  await page
    .getByRole("button", { name: "Close bottom panel", exact: true })
    .click();
  p.assets.push({
    id: "coordinate-shader",
    name: "coordinates.frag",
    aliases: [],
    type: "shader",
    originalName: "coordinates.frag",
    mimeType: "text/plain",
    metadata: {},
    data: "void main(image) { if(abs(u_pixel.x)<30.0 && abs(u_pixel.y)<30.0) return vec3(1.0); return u_pixel.y > 0.0 ? vec3(1.0,0.0,0.0) : vec3(0.0,0.0,1.0); }",
  });
  p.code =
    'group { rect({width:1920,height:1080}); shader("coordinates.frag"); }';
  await load();
  for (const quality of ["0.25", "1"]) {
    await page
      .getByRole("combobox", { name: "Preview resolution", exact: true })
      .selectOption(quality);
    await page.waitForTimeout(900);
    assert((await pixel(0.5, 0.5)).slice(0, 3).every((v) => v > 245));
    assert((await pixel(0.5, 0.25))[0] > 245);
    assert((await pixel(0.5, 0.75))[2] > 245);
  }
  console.log(
    "PASS GLSL u_pixel is centered with +Y up at all preview qualities",
  );
} finally {
  await browser.close();
}
