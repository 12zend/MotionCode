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
// Replace only the native chooser. Writes use a real browser FileSystemFileHandle.
await page.addInitScript(() => {
  window.__pickerCalls = 0;
  window.showSaveFilePicker = async () => {
    window.__pickerCalls++;
    const directory = await navigator.storage.getDirectory();
    return directory.getFileHandle(`chosen-${window.__pickerCalls}.motion`, {
      create: true,
    });
  };
});
const savedFile = (name) =>
  page.evaluate(async (name) => {
    const dir = await navigator.storage.getDirectory();
    const file = await (await dir.getFileHandle(name)).getFile();
    return JSON.parse(await file.text());
  }, name);
const waitSaved = () =>
  page.waitForFunction(
    () =>
      document.querySelector('button[aria-busy="false"]') &&
      document
        .querySelector('[role="status"]')
        ?.textContent.includes("保存しました"),
  );
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForSelector(".monaco-editor");
  await page.waitForTimeout(1000);
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+s");
  await waitSaved();
  assert.equal(await page.evaluate(() => window.__pickerCalls), 1);
  const original = await savedFile("chosen-1.motion");
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Updated project");
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__pickerCalls), 1);
  assert.equal((await savedFile("chosen-1.motion")).name, "Updated project");
  assert.equal((await savedFile("chosen-1.motion")).id, original.id);
  console.log("PASS First Ctrl+S chooses a file; second Ctrl+S replaces it");
  await page.keyboard.press("Control+Shift+s");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__pickerCalls), 2);
  assert.equal((await savedFile("chosen-2.motion")).name, "Updated project");
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Saved to second");
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__pickerCalls), 2);
  assert.equal((await savedFile("chosen-2.motion")).name, "Saved to second");
  assert.equal((await savedFile("chosen-1.motion")).name, "Updated project");
  console.log("PASS Save As selects a new file and later saves reuse it");
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector(".monaco-editor");
  await page.waitForTimeout(1100);
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("After reload");
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__pickerCalls), 0);
  assert.equal((await savedFile("chosen-2.motion")).name, "After reload");
  console.log(
    "PASS Reload restores the chosen file handle without a new picker",
  );
} finally {
  await browser.close();
}
