// Builds Rondom from src/ + data/. No dependencies.
//   node scripts/build.mjs            -> public/index.html + public/sw.js (Vercel site, offline + installable)
//   node scripts/build.mjs --artifact -> dist/artifact.html (single file for the claude.ai artifact; jsPDF from cdnjs, icon inlined, no service worker)
// The validator fails the build on bad data. Never weaken it; fix the data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("..", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");
const ARTIFACT = process.argv.includes("--artifact");

const events = JSON.parse(read("data/events.json"));
const concerts = JSON.parse(read("data/concerts.json"));
const venues = JSON.parse(read("data/venues.json"));
const geo = JSON.parse(read("data/geo.json"));
const meta = JSON.parse(read("data/meta.json"));

const KINDS = ["festival", "spectacle", "concert", "kpop", "museum", "food", "culture", "military", "aviation", "sport", "other"];
const GENRES = ["kpop", "pop", "rock", "hiphop", "electronic", "classical", "other"];
const STATUS = ["announced", "onsale", "soldout", "cancelled", "tbd"];
const FOR = ["anne", "alma", "nick", "family"];
const RISK = ["low", "medium", "high"];
const COUNTRIES = ["NL", "BE", "DE", "LU", "FR"];
const iso = /^\d{4}-\d{2}-\d{2}$/;
const errors = [], ids = new Set();
const vids = new Set(venues.map(v => v.id));
const dup = id => { if (ids.has(id)) errors.push(`duplicate id ${id}`); ids.add(id); };
const need = (o, keys, label) => keys.forEach(k => { if (o[k] == null || o[k] === "") errors.push(`${label}: missing ${k}`); });
const isDate = (o, k, label, optional) => { const v = o[k]; if (v == null) { if (!optional) errors.push(`${label}: missing ${k}`); return; } if (!iso.test(v) || isNaN(Date.parse(v))) errors.push(`${label}: bad date ${k}=${v}`); };

for (const v of venues) { need(v, ["id", "name", "city", "country", "lat", "lng", "driveMin", "listingsUrl"], "venue " + (v.id || "?")); dup(v.id); if (v.driveMin > 300) errors.push(`venue ${v.id}: driveMin over 300`); }
for (const e of events) {
  const L = e.name || e.id || "?";
  need(e, ["id", "name", "short", "kind", "city", "country", "region", "lat", "lng", "driveMin", "start", "end", "tier", "for", "confidence", "source", "addedOn", "status"], L);
  dup(e.id);
  if (e.id && !/^[a-z0-9-]+$/.test(e.id)) errors.push(`${L}: id must be a lowercase slug`);
  if (e.short && e.short.length > 22) errors.push(`${L}: short is ${e.short.length} chars (max 22)`);
  if (!KINDS.includes(e.kind)) errors.push(`${L}: unknown kind ${e.kind}`);
  if (!COUNTRIES.includes(e.country)) errors.push(`${L}: unknown country ${e.country}`);
  isDate(e, "start", L); isDate(e, "end", L); isDate(e, "addedOn", L); isDate(e, "onSale", L, true); isDate(e, "planBy", L, true); isDate(e, "verifiedOn", L, true); isDate(e, "changedOn", L, true);
  if (e.start && e.end && e.start > e.end) errors.push(`${L}: start ${e.start} after end ${e.end}`);
  if (!(e.tier >= 1 && e.tier <= 3)) errors.push(`${L}: tier must be 1-3`);
  if (!Array.isArray(e.for) || e.for.some(p => !FOR.includes(p))) errors.push(`${L}: bad for tags ${JSON.stringify(e.for)}`);
  if (!["confirmed", "projected"].includes(e.confidence)) errors.push(`${L}: confidence must be confirmed|projected`);
  if (!STATUS.includes(e.status)) errors.push(`${L}: unknown status ${e.status}`);
  if (e.sellOutRisk != null && !RISK.includes(e.sellOutRisk)) errors.push(`${L}: bad sellOutRisk ${e.sellOutRisk}`);
  const maxDrive = e.tierException ? 300 : 180;
  if (e.driveMin > maxDrive) errors.push(`${L}: driveMin ${e.driveMin} over ${maxDrive}`);
  if (e.onSale && e.start && e.onSale > e.start) errors.push(`${L}: onSale ${e.onSale} after start ${e.start}`);
  if (e.planBy && e.start && e.planBy > e.start) errors.push(`${L}: planBy ${e.planBy} after start ${e.start}`);
  if (e.days && e.days.length) { const ds = [...e.days].sort(); ds.forEach(d => { if (!iso.test(d)) errors.push(`${L}: bad day ${d}`); }); if (ds[0] !== e.start || ds[ds.length - 1] !== e.end) errors.push(`${L}: days must start at start (${ds[0]} vs ${e.start}) and end at end (${ds[ds.length - 1]} vs ${e.end})`); }
  if (e.priceFrom != null && typeof e.priceFrom !== "number") errors.push(`${L}: priceFrom must be a number or null`);
  if (typeof e.source !== "string" || !/^https?:\/\//.test(e.source)) errors.push(`${L}: source must be a URL`);
}
for (const c of concerts) {
  const L = c.artist || c.id || "?";
  need(c, ["id", "artist", "short", "date", "genre", "for", "status", "confidence", "source", "addedOn"], L);
  dup(c.id);
  if (c.id && !/^[a-z0-9-]+$/.test(c.id)) errors.push(`${L}: id must be a lowercase slug`);
  if (c.short && c.short.length > 22) errors.push(`${L}: short is ${c.short.length} chars (max 22)`);
  if (!GENRES.includes(c.genre)) errors.push(`${L}: unknown genre ${c.genre}`);
  if (!STATUS.includes(c.status)) errors.push(`${L}: unknown status ${c.status}`);
  if (!Array.isArray(c.for) || c.for.some(p => !FOR.includes(p))) errors.push(`${L}: bad for tags`);
  if (!["confirmed", "projected"].includes(c.confidence)) errors.push(`${L}: confidence must be confirmed|projected`);
  if (c.sellOutRisk != null && !RISK.includes(c.sellOutRisk)) errors.push(`${L}: bad sellOutRisk ${c.sellOutRisk}`);
  isDate(c, "date", L); isDate(c, "addedOn", L); isDate(c, "onSale", L, true); isDate(c, "planBy", L, true); isDate(c, "verifiedOn", L, true); isDate(c, "changedOn", L, true);
  if (c.doors != null && !/^\d{2}:\d{2}$/.test(c.doors)) errors.push(`${L}: doors must be HH:MM or null`);
  if (c.venueId != null) { if (!vids.has(c.venueId)) errors.push(`${L}: unknown venueId ${c.venueId}`); }
  else need(c, ["venueName", "city", "country", "lat", "lng", "driveMin"], L + " (no venueId)");
  const dm = c.driveMin ?? (venues.find(v => v.id === c.venueId) || {}).driveMin;
  if (dm == null) errors.push(`${L}: no driveMin`); else if (dm > 300) errors.push(`${L}: driveMin ${dm} over 300`);
  if (c.onSale && c.date && c.onSale > c.date) errors.push(`${L}: onSale after date`);
  if (c.planBy && c.date && c.planBy > c.date) errors.push(`${L}: planBy after date`);
  if (c.priceFrom != null && typeof c.priceFrom !== "number") errors.push(`${L}: priceFrom must be a number or null`);
  if (c.tier != null && !(c.tier >= 1 && c.tier <= 3)) errors.push(`${L}: tier must be 1-3`);
}
if (!meta.checked || !meta.version || !iso.test(meta.built || "")) errors.push("meta.json needs checked, version and built (YYYY-MM-DD)");
if (errors.length) { console.error(errors.join("\n")); console.error(`\n${errors.length} validation errors. Build stopped.`); process.exit(1); }

const iconSvg = read("public/icons/favicon.svg");
const iconData = "data:image/svg+xml;base64," + Buffer.from(iconSvg).toString("base64");
const tpl = read("src/index.template.html");
let html = tpl
  .replace("__EVENTS__", () => JSON.stringify(events))
  .replace("__CONCERTS__", () => JSON.stringify(concerts))
  .replace("__VENUES__", () => JSON.stringify(venues))
  .replace("__GEO__", () => JSON.stringify(geo))
  .replace("__META__", () => JSON.stringify(meta))
  .replaceAll("__ICON_SRC__", ARTIFACT ? iconData : "/icons/favicon.svg")
  .replace("__JSPDF_SRC__", ARTIFACT ? "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" : "/vendor/jspdf-2.5.1.umd.min.js")
  .replaceAll("__PWA__", ARTIFACT ? "false" : "true");
if (ARTIFACT) {
  // The claude.ai artifact host wraps the file in its own document skeleton (doctype, charset, viewport, reset), so the artifact build ships only the page content.
  html = html.replace(/<!--PWA-->[\s\S]*?<!--\/PWA-->\n?/, "")
    .replace(/^<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*/i, "")
    .replace(/<meta charset="utf-8">\s*/i, "").replace(/<meta name="viewport"[^>]*>\s*/i, "")
    .replace(/<title>Rondom<\/title>/, '<title>Rondom</title>\n<meta name="claude:viewport-fit-sides" content="cover">')
    .replace(/<\/head>\s*<body>\s*/i, "").replace(/\s*<\/body>\s*<\/html>\s*$/i, "\n");
}

const counts = {}; events.forEach(e => counts[e.kind] = (counts[e.kind] || 0) + 1); concerts.forEach(c => { const k = c.genre === "kpop" ? "kpop" : "concert"; counts[k] = (counts[k] || 0) + 1; });
const projected = events.filter(e => e.confidence === "projected").length + concerts.filter(c => c.confidence === "projected").length;
const summary = `${events.length} events + ${concerts.length} concerts (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ")}); ${projected} projected`;
if (ARTIFACT) {
  mkdirSync(new URL("dist/", root), { recursive: true });
  writeFileSync(new URL("dist/artifact.html", root), html);
  console.log(`Built dist/artifact.html: ${summary}`);
} else {
  writeFileSync(new URL("public/index.html", root), html);
  const version = createHash("sha1").update(html).update(read("src/sw.template.js")).digest("hex").slice(0, 10);
  writeFileSync(new URL("public/sw.js", root), read("src/sw.template.js").replace("__VERSION__", version));
  console.log(`Built public/: ${summary}, cache out-${version}`);
}
