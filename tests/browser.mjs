import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.addInitScript(() => {
  window.showSaveFilePicker = undefined;
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const store = (fn) =>
  page.evaluate(async (fn) => {
    const url = performance
      .getEntriesByType("resource")
      .find((e) => e.name.includes("/src/project/store.ts"))?.name;
    const { useStore } = await import(url || "/src/project/store.ts");
    return new Function("s", `return (${fn})(s)`)(useStore.getState());
  }, fn.toString());
const wait = () => page.waitForTimeout(900);
const code = async (value) => {
  await page
    .getByRole("button", { name: "main.motion", exact: false })
    .first()
    .click();
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(value);
  await wait();
};
const pixel = (x, y) =>
  page.locator('canvas[aria-label="Motion preview"]').evaluate(
    (c, { x, y }) => {
      const gl = c.getContext("webgl2");
      const p = new Uint8Array(4);
      gl.readPixels(
        Math.floor(((x + 960) * c.width) / 1920),
        Math.floor(c.height - ((y + 540) * c.height) / 1080 - 1),
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
const checks = [];
const check = (name) => {
  checks.push(name);
  console.log("PASS", name);
};
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForSelector(".monaco-editor");
  await page.waitForTimeout(1800);
  assert.deepEqual(await store((s) => s.diagnostics), []);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  assert.equal(await page.locator(".track").count(), 5);
  check("Initial demo compiles and renders with WebGL2 shader");
  const defaultProject = await store((s) => s.project);
  const defaultCode = defaultProject.code;
  await code(
    'group { rect({position:[100,-100,0],width:300,height:300,color:"#ffffff"}); shader("gradient.frag"); } rect({position:[800,-100,0],width:300,height:300,color:"#ff0000"});',
  );
  let inside = await pixel(200, 200),
    outside = await pixel(900, 200);
  assert(
    inside[2] > 230 && inside[0] > 100 && inside[0] < 200,
    JSON.stringify({ inside, outside }),
  );
  assert(outside[0] > 245 && outside[1] < 10 && outside[2] < 10);
  check("Gradient shader changes only its group; sibling stays red");
  await code(
    'group { rect({position:[0,0,0],width:1920,height:1080,color:"#888888"}); shader("noise.frag", 0); }',
  );
  await page.locator(".asset-row").filter({ hasText: "noise.frag" }).click();
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page
    .locator(".view-menu")
    .getByRole("button", { name: "Properties", exact: true })
    .click();
  await page
    .getByRole("slider", { name: "intensity", exact: true })
    .fill("1.5");
  await wait();
  let changed = await pixel(200, 200);
  await page.getByRole("slider", { name: "intensity", exact: true }).fill("0");
  await wait();
  let unchanged = await pixel(200, 200);
  assert.notDeepEqual(changed, unchanged);
  assert(Math.abs(unchanged[0] - 136) < 3);
  check("Reflected uniform slider updates a paused frame");
  await code(
    'group { group { rect({position:[100,-100,0],width:200,height:200,opacity:0.5,color:"#ffffff"}); shader("noise.frag", 0); } }',
  );
  const alpha = await pixel(125, 125);
  assert(Math.abs(alpha[0] - 139) < 4, JSON.stringify(alpha));
  check("Nested group shaders preserve half opacity without darkening");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#00ff00"/></svg>';
  await page.locator(".media-panel").evaluate((el, svg) => {
    const dt = new DataTransfer();
    dt.items.add(new File([svg], "image.svg", { type: "image/svg+xml" }));
    el.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, svg);
  await wait();
  assert.equal(
    await page.locator(".asset-row").filter({ hasText: "image.svg" }).count(),
    1,
  );
  check("Actual file drop imports a UUID-addressed image");
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("draw(");
  await page.waitForTimeout(350);
  await page.keyboard.press("Control+Space");
  await page.waitForTimeout(350);
  assert(
    (await page.locator(".suggest-widget").innerText()).includes("image.svg"),
  );
  await page.keyboard.press("Escape");
  check("Monaco completion filters imported image assets for draw()");

  await code('draw("image.svg",100,-100,0,1,0,5,"#ffffff");');
  let image = await pixel(125, 125);
  assert(image[1] > 245 && image[0] < 10, JSON.stringify(image));
  check("draw() displays the imported image");
  await page.locator(".asset-row").filter({ hasText: "image.svg" }).click();
  await page.getByRole("button", { name: "Rename asset", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Asset name", exact: true })
    .fill("renamed.svg");
  await page
    .getByRole("textbox", { name: "Asset name", exact: true })
    .press("Enter");
  await wait();
  assert((await store((s) => s.project.code)).includes("renamed.svg"));
  assert((await pixel(125, 125))[1] > 245);
  check("Rename refactors references without breaking preview");
  await code('text("HELLO", "Inter", 100, 200, 0, 1, 0, 2, "#ffffff");');
  let textPixels = await page
    .locator('canvas[aria-label="Motion preview"]')
    .evaluate((c) => {
      const gl = c.getContext("webgl2"),
        p = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, p);
      let count = 0;
      for (let i = 0; i < p.length; i += 4)
        if (p[i] > 200 && p[i + 1] > 200) count++;
      return count;
    });
  assert(textPixels > 500);
  check("Positional text() draws glyphs");
  await code(
    'rect({position:[ease("out",100,800,0,1),-100,0],width:100,height:100,color:"#ffffff"});',
  );
  await page
    .getByRole("slider", { name: "Current time", exact: true })
    .fill("0");
  await wait();
  assert((await pixel(125, 125))[0] > 240);
  await page
    .getByRole("slider", { name: "Current time", exact: true })
    .fill("1");
  await wait();
  assert((await pixel(825, 125))[0] > 240);
  assert((await pixel(125, 125))[0] < 40);
  check("ease() and arbitrary-time scrubbing move the drawable");
  await code(
    'rect({position:[100,-100,0],width:100,height:100,t1:2,t2:4,color:"#ffffff"});',
  );
  for (const [time, visible] of [
    [1, false],
    [2, true],
    [3, true],
    [4, false],
  ]) {
    await page
      .getByRole("slider", { name: "Current time", exact: true })
      .fill(String(time));
    await wait();
    assert.equal(
      (await pixel(125, 125))[0] > 240,
      visible,
      `interval boundary ${time}`,
    );
  }
  check(
    "t1–t2 is an absolute half-open interval, including both boundary cases",
  );
  await page
    .getByRole("slider", { name: "Current time", exact: true })
    .fill("1");

  await code("let broken = ;");
  await page.waitForFunction(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find((e) => e.name.includes("/src/project/store.ts")).name;
    return (await import(url)).useStore.getState().diagnostics.length > 0;
  });
  await code('rect({position:[0,0,0],width:300,height:300,color:"#ff0000"});');
  assert.deepEqual(await store((s) => s.diagnostics), []);
  assert((await pixel(125, 125))[0] > 245);
  check("Incomplete syntax preserves IDE and recovers on edit");
  await code("while(true) {}");
  await page.waitForTimeout(2200);
  assert(
    (await store((s) => s.diagnostics)).some((d) =>
      d.message.includes("execution limit"),
    ),
  );
  await code('draw("renamed.svg",100,-100,0,1,0,5,"#ffffff");');
  await wait();
  assert.deepEqual(await store((s) => s.diagnostics), []);
  assert((await pixel(125, 125))[1] > 245);
  check("Infinite loop is terminated and worker recovers after editing");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const downloaded = await downloadEvent;
  const path = await downloaded.path();
  const saved = JSON.parse(await fs.readFile(path, "utf8"));
  assert(
    saved.assets.some(
      (a) => a.name === "renamed.svg" && a.data.startsWith("data:"),
    ),
  );
  await code('text("CHANGED");');
  await page.getByTestId("project-input").setInputFiles({
    name: "restored.motion",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await wait();
  assert.equal(await store((s) => s.project.code), saved.code);
  assert((await pixel(125, 125))[1] > 245);
  check(".motion download and file load restore code and embedded media");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const imageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG frame", exact: true }).click();
  assert((await imageDownload).suggestedFilename().endsWith(".png"));
  check("PNG export uses the preview renderer");
  await page.getByTestId("project-input").setInputFiles({
    name: "demo.motion",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(defaultProject)),
  });
  await wait();
  await page
    .getByRole("slider", { name: "Current time", exact: true })
    .fill("1.8");
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await wait();
  await page
    .getByRole("button", { name: "Close bottom panel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  await page.screenshot({ path: "/tmp/motioncode-final-desktop.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await wait();
  await page.screenshot({ path: "/tmp/motioncode-compact.png" });
  assert.equal(
    await page
      .locator(".toolbar")
      .evaluate((e) => e.scrollWidth > e.clientWidth),
    false,
  );
  check("Compact desktop layout remains usable");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
