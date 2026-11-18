// Renders a script-driven agenda page in headless Chromium and prints what a plain fetch cannot see.
//   node scripts/venue-browse.mjs <url> [--more "<button text>"] [--scrolls 6] [--json] [--out file]
// Prints the rendered text (default) or, with --json, every JSON response the page fetched (url + body).
// For the weekly venue sweep: use it for venues whose agenda is built by scripts (D.LIVE halls, Festhalle, MECC, Accor Arena).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2), url = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
if (!url) { console.error("usage: node scripts/venue-browse.mjs <url> [--more text] [--scrolls n] [--json] [--out file]"); process.exit(1); }
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
const ctx = await browser.newContext({ ignoreHTTPSErrors: false, locale: "en-GB", viewport: { width: 1280, height: 2000 } });
const page = await ctx.newPage();
const jsons = [];
page.on("response", async r => { try { const ct = r.headers()["content-type"] || ""; if (ct.includes("json") && r.status() === 200) { const b = await r.text(); if (b.length > 200) jsons.push({ url: r.url(), body: b }); } } catch (e) {} });
let status = null;
try { const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }); status = r && r.status(); await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); }
catch (e) { console.error("navigation failed:", e.message.split("\n")[0]); }
for (const t of ["Alle akzeptieren", "Akzeptieren", "Accept all", "Alles accepteren", "Tout accepter", "Accepter", "OK"]) { const b = page.getByRole("button", { name: t }).first(); if (await b.count().catch(() => 0)) { await b.click({ timeout: 2000 }).catch(() => {}); break; } }
const more = opt("--more", null), scrolls = +opt("--scrolls", 6);
for (let i = 0; i < scrolls; i++) {
  await page.mouse.wheel(0, 6000); await page.waitForTimeout(700);
  if (more) { const b = page.getByText(more, { exact: false }).last(); if (await b.count().catch(() => 0)) { await b.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(1200); } }
}
const out = args.includes("--json") ? JSON.stringify(jsons.map(j => ({ url: j.url, body: j.body })), null, 1) : `# ${page.url()} (HTTP ${status})\n` + (await page.evaluate(() => document.body.innerText)).replace(/\n{3,}/g, "\n\n");
const file = opt("--out", null); if (file) { writeFileSync(file, out); console.log(`wrote ${out.length} chars to ${file}; ${jsons.length} JSON responses seen`); } else console.log(out);
await browser.close();
