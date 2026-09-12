import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const canvas = page.locator('canvas[aria-label="Motion preview"]');
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
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForSelector(".monaco-editor");
  await page.waitForTimeout(1200);
  const p = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find((e) => e.name.includes("/src/project/store.ts")).name;
    return (await import(url)).useStore.getState().project;
  });
  p.code =
    '// origin test\n\nrect({position:[0,0,0],anchorPoint:[0,0],width:120,height:120,color:"#ffffff"});\nrect({position:[-300,250,0],anchorPoint:[0,0],width:100,height:100,color:"#ff0000"});\nrect({position:[300,-250,0],anchorPoint:[0,0],width:100,height:100,color:"#0000ff"});';
  await page.getByTestId("project-input").setInputFiles({
    name: "coordinates.motion",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.waitForTimeout(1100);
  assert((await pixel(0.5, 0.5))[0] > 245);
  assert((await pixel(0.5 - 300 / 1920, 0.5 - 250 / 1080))[0] > 245);
  assert((await pixel(0.5 + 300 / 1920, 0.5 + 250 / 1080))[2] > 245);
  console.log(
    "PASS Origin is centered, positive Y draws above and negative Y below",
  );
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const outline = await page.locator(".object-outline").first().boundingBox();
  assert(Math.abs(outline.x + outline.width / 2 - (box.x + box.width / 2)) < 2);
  assert(
    Math.abs(outline.y + outline.height / 2 - (box.y + box.height / 2)) < 2,
  );
  console.log(
    "PASS Picking and selection outline match the centered coordinate system",
  );
  p.code =
    'rect({position:[mouse.x,mouse.y,0],anchorPoint:[0,0],width:80,height:80,color:"#ffffff"});';
  await page.getByTestId("project-input").setInputFiles({
    name: "mouse.motion",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.waitForTimeout(800);
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForTimeout(600);
  assert((await pixel(0.3, 0.3))[0] > 245);
  console.log(
    "PASS Mouse coordinates use the same centered positive-up convention",
  );
} finally {
  await browser.close();
}
