// Renders public/icons/*.png from public/icons/favicon.svg with the pre-installed Chromium (Playwright).
//   node scripts/icons.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url);
const svg = readFileSync(new URL("public/icons/favicon.svg", root), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#0b1518">${svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`)}</body></html>`);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false, type: "png" });
  writeFileSync(new URL("public/icons/" + name, root), buf);
  console.log(name, size, buf.length, "bytes");
}
await browser.close();
