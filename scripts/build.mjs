// Builds Rondom from src/ + data/. No dependencies.
//   node scripts/build.mjs            -> public/index.html + public/sw.js + public/calendar/*.ics (Vercel site, offline + installable)
//   node scripts/build.mjs --artifact -> dist/artifact.html (single file for the claude.ai artifact; jsPDF from cdnjs, icon inlined, no service worker)
// The validator fails the build on bad data. Never weaken it; fix the data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("..", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");
const ARTIFACT = process.argv.includes("--artifact");
const SITE = "https://todonl.vercel.app";

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
const REGIONS = new Set(["Limburg (NL)", "Noord-Brabant", "Gelderland", "Utrecht", "Noord-Holland", "Zuid-Holland", "Zeeland", "Overijssel", "Flevoland", "Drenthe", "Friesland", "Groningen",
  "Limburg (BE)", "Antwerp", "East Flanders", "West Flanders", "Flemish Brabant", "Flanders", "Brussels", "Liège", "Hainaut", "Namur", "Luxembourg (BE)", "Walloon Brabant", "Wallonia",
  "NRW", "Rheinland-Pfalz", "Hessen", "Saarland", "Niedersachsen", "Luxembourg", "Hauts-de-France", "Grand Est", "Île-de-France"]);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = /^\d{4}-\d{2}-\d{2}$/, hhmm = /^\d{2}:\d{2}$/;
const today = new Date().toISOString().slice(0, 10);
const recent = d => d && (Date.parse(today) - Date.parse(d)) / 864e5 <= 7;
const errors = [], warnings = [], ids = new Set();
const vids = new Set(venues.map(v => v.id));
const dup = id => { if (ids.has(id)) errors.push(`duplicate id ${id}`); ids.add(id); };
const need = (o, keys, label) => keys.forEach(k => { if (o[k] == null || o[k] === "") errors.push(`${label}: missing ${k}`); });
const isDate = (o, k, label, optional) => { const v = o[k]; if (v == null) { if (!optional) errors.push(`${label}: missing ${k}`); return; } if (!iso.test(v) || isNaN(Date.parse(v))) errors.push(`${label}: bad date ${k}=${v}`); };
const isNum = (o, k, label, lo, hi, optional) => { const v = o[k]; if (v == null) { if (!optional) errors.push(`${label}: missing ${k}`); return; } if (typeof v !== "number" || isNaN(v) || v < lo || v > hi) errors.push(`${label}: ${k} must be a number between ${lo} and ${hi}, got ${JSON.stringify(v)}`); };
const relative = /\b(tomorrow|tonight|yesterday|at time of research|still (available|listed)|this week|next week)\b/i;
const checkText = (o, k, label) => { if (typeof o[k] === "string" && relative.test(o[k])) errors.push(`${label}: ${k} uses relative time wording ("${o[k].slice(0, 60)}")`); };

for (const v of venues) { need(v, ["id", "name", "city", "country", "listingsUrl"], "venue " + (v.id || "?")); dup(v.id); isNum(v, "lat", "venue " + v.id, 40, 60); isNum(v, "lng", "venue " + v.id, -5, 15); isNum(v, "driveMin", "venue " + v.id, 5, 300); }
const shorts = new Map();
for (const e of events) {
  const L = e.name || e.id || "?";
  need(e, ["id", "name", "short", "kind", "city", "country", "region", "start", "end", "tier", "for", "confidence", "source", "addedOn", "status", "why"], L);
  dup(e.id);
  if (e.id && (!/^[a-z0-9-]+$/.test(e.id) || e.id.includes("--"))) errors.push(`${L}: id must be a lowercase slug without "--"`);
  if (e.short && e.short.length > 22) errors.push(`${L}: short is ${e.short.length} chars (max 22)`);
  if (e.name && e.name.length > 80) warnings.push(`${L}: name is ${e.name.length} chars; cards wrap`);
  if (!KINDS.includes(e.kind)) errors.push(`${L}: unknown kind ${e.kind}`);
  if (!COUNTRIES.includes(e.country)) errors.push(`${L}: unknown country ${e.country}`);
  if (e.region && !REGIONS.has(e.region)) errors.push(`${L}: unknown region "${e.region}" (add it to REGIONS in build.mjs or use an existing name)`);
  isNum(e, "lat", L, 40, 60); isNum(e, "lng", L, -5, 15);
  if (e.driveMin == null) { if (recent(e.addedOn)) warnings.push(`${L}: driveMin is null (run scripts/drive-times.mjs)`); else errors.push(`${L}: driveMin is null and the entry is older than 7 days`); }
  else isNum(e, "driveMin", L, 5, 300);
  isDate(e, "start", L); isDate(e, "end", L); isDate(e, "addedOn", L); isDate(e, "onSale", L, true); isDate(e, "planBy", L, true); isDate(e, "verifiedOn", L, true); isDate(e, "changedOn", L, true);
  if (e.start && e.end && e.start > e.end) errors.push(`${L}: start ${e.start} after end ${e.end}`);
  if (!(e.tier >= 1 && e.tier <= 3)) errors.push(`${L}: tier must be 1-3`);
  if (!Array.isArray(e.for) || !e.for.length || e.for.some(p => !FOR.includes(p))) errors.push(`${L}: for must be a non-empty array of ${FOR.join("|")}`);
  if (e.tags != null && (!Array.isArray(e.tags) || e.tags.some(t => typeof t !== "string"))) errors.push(`${L}: tags must be an array of strings`);
  if (!["confirmed", "projected"].includes(e.confidence)) errors.push(`${L}: confidence must be confirmed|projected`);
  if (!STATUS.includes(e.status)) errors.push(`${L}: unknown status ${e.status}`);
  if (e.confidence === "projected" && e.status === "onsale") errors.push(`${L}: projected dates cannot be on sale`);
  if (e.sellOutRisk != null && !RISK.includes(e.sellOutRisk)) errors.push(`${L}: bad sellOutRisk ${e.sellOutRisk}`);
  if (e.tierException && e.tier !== 1) errors.push(`${L}: tierException is only for tier 1`);
  const maxDrive = e.tierException ? 300 : 180;
  if (e.driveMin > maxDrive) errors.push(`${L}: driveMin ${e.driveMin} over ${maxDrive}`);
  if (e.onSale && e.start && e.onSale > e.start) errors.push(`${L}: onSale ${e.onSale} after start ${e.start}`);
  if (e.planBy && e.start && e.planBy > e.start) errors.push(`${L}: planBy ${e.planBy} after start ${e.start}`);
  if (e.changedOn && !e.prevStatus) errors.push(`${L}: changedOn needs prevStatus`);
  if (e.startTime != null && !hhmm.test(e.startTime)) errors.push(`${L}: startTime must be HH:MM or null`);
  if (e.days && e.days.length) { const ds = [...e.days].sort(); ds.forEach(d => { if (!iso.test(d)) errors.push(`${L}: bad day ${d}`); }); if (ds[0] !== e.start || ds[ds.length - 1] !== e.end) errors.push(`${L}: days must start at start (${ds[0]} vs ${e.start}) and end at end (${ds[ds.length - 1]} vs ${e.end})`); }
  if (e.priceFrom != null && typeof e.priceFrom !== "number") errors.push(`${L}: priceFrom must be a number or null`);
  if (typeof e.source !== "string" || !/^https:\/\//.test(e.source)) errors.push(`${L}: source must be an https URL`);
  if (e.tags && e.tags.includes("free") && e.priceFrom > 0) errors.push(`${L}: tagged free with priceFrom ${e.priceFrom}`);
  ["why", "highlights", "tip", "ticketNote", "dateNote"].forEach(k => checkText(e, k, L));
  const sk = (e.start || "").slice(0, 4) + "|" + e.short; if (shorts.has(sk)) errors.push(`${L}: short "${e.short}" is already used by ${shorts.get(sk)} in the same year`); shorts.set(sk, e.id);
}
for (const c of concerts) {
  const L = c.artist || c.id || "?";
  need(c, ["id", "artist", "short", "date", "genre", "for", "status", "confidence", "source", "addedOn", "why"], L);
  dup(c.id);
  if (c.id && (!/^[a-z0-9-]+$/.test(c.id) || c.id.includes("--"))) errors.push(`${L}: id must be a lowercase slug without "--"`);
  if (c.short && c.short.length > 22) errors.push(`${L}: short is ${c.short.length} chars (max 22)`);
  if (!GENRES.includes(c.genre)) errors.push(`${L}: unknown genre ${c.genre}`);
  if (!STATUS.includes(c.status)) errors.push(`${L}: unknown status ${c.status}`);
  if (!Array.isArray(c.for) || c.for.some(p => !FOR.includes(p))) errors.push(`${L}: bad for tags`);
  if (Array.isArray(c.for) && !c.for.length) warnings.push(`${L}: for is empty; the entry scores no profile points and is hidden when a person is selected`);
  if (!["confirmed", "projected"].includes(c.confidence)) errors.push(`${L}: confidence must be confirmed|projected`);
  if (c.confidence === "projected" && c.status === "onsale") errors.push(`${L}: projected dates cannot be on sale`);
  if (c.sellOutRisk != null && !RISK.includes(c.sellOutRisk)) errors.push(`${L}: bad sellOutRisk ${c.sellOutRisk}`);
  if (c.genre === "kpop" && c.sellOutRisk !== "high") warnings.push(`${L}: K-pop entries normally carry sellOutRisk high`);
  isDate(c, "date", L); isDate(c, "addedOn", L); isDate(c, "onSale", L, true); isDate(c, "planBy", L, true); isDate(c, "verifiedOn", L, true); isDate(c, "changedOn", L, true);
  if (c.doors != null && !hhmm.test(c.doors)) errors.push(`${L}: doors must be HH:MM or null`);
  if (c.venueId != null) { if (!vids.has(c.venueId)) errors.push(`${L}: unknown venueId ${c.venueId}`); }
  else { need(c, ["venueName", "city", "country"], L + " (no venueId)"); isNum(c, "lat", L, 40, 60); isNum(c, "lng", L, -5, 15); if (!COUNTRIES.includes(c.country)) errors.push(`${L}: unknown country ${c.country}`); }
  const dm = c.driveMin ?? (venues.find(v => v.id === c.venueId) || {}).driveMin;
  if (dm == null) { if (recent(c.addedOn)) warnings.push(`${L}: driveMin is null (run scripts/drive-times.mjs)`); else errors.push(`${L}: no driveMin and older than 7 days`); } else if (typeof dm !== "number" || dm > 300) errors.push(`${L}: driveMin ${dm} over 300`);
  if (c.onSale && c.date && c.onSale > c.date) errors.push(`${L}: onSale after date`);
  if (c.planBy && c.date && c.planBy > c.date) errors.push(`${L}: planBy after date`);
  if (c.changedOn && !c.prevStatus) errors.push(`${L}: changedOn needs prevStatus`);
  if (c.priceFrom != null && typeof c.priceFrom !== "number") errors.push(`${L}: priceFrom must be a number or null`);
  if (c.tier != null && !(c.tier >= 1 && c.tier <= 3)) errors.push(`${L}: tier must be 1-3`);
  if (typeof c.source !== "string" || !/^https:\/\//.test(c.source)) errors.push(`${L}: source must be an https URL`);
  ["why", "note"].forEach(k => checkText(c, k, L));
  const sk = c.date + "|" + c.short; if (shorts.has(sk)) errors.push(`${L}: short "${c.short}" is already used on ${c.date} by ${shorts.get(sk)}`); shorts.set(sk, c.id);
}
if (!meta.version || !iso.test(meta.built || "")) errors.push("meta.json needs version and built (YYYY-MM-DD)");
else { const b = meta.built.split("-"); const want = `${+b[2]} ${MON[+b[1] - 1]} ${b[0]}`; if (meta.checked !== want) errors.push(`meta.json: checked must be "${want}" to match built ${meta.built}`); }
if (warnings.length) console.warn("Warnings:\n" + warnings.join("\n"));
if (errors.length) { console.error(errors.join("\n")); console.error(`\n${errors.length} validation errors. Build stopped.`); process.exit(1); }

// Script-safe JSON: "<" is escaped so a stray "</script>" inside a text field cannot end the inline script.
const J = o => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const generated = new Date().toISOString();
const iconSvg = read("public/icons/favicon.svg");
const iconData = "data:image/svg+xml;base64," + Buffer.from(iconSvg).toString("base64");
const tpl = read("src/index.template.html");
let html = tpl
  .replace("__EVENTS__", () => J(events))
  .replace("__CONCERTS__", () => J(concerts))
  .replace("__VENUES__", () => J(venues))
  .replace("__GEO__", () => J(geo))
  .replace("__META__", () => J({ ...meta, generated }))
  .replaceAll("__ICON_SRC__", ARTIFACT ? iconData : "/icons/favicon.svg")
  .replaceAll("__SITE__", SITE)
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

/* ---------- ICS feeds: one per person plus tier 1, subscribed once on each phone ---------- */
const icsEsc = s => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = line => { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = " " + s.slice(73); } out.push(s); return out.join("\r\n"); };
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const ymd = d => d.replace(/-/g, "");
const dayName = d => { const x = new Date(d + "T00:00:00Z"); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][x.getUTCDay()] + " " + x.getUTCDate() + " " + MON[x.getUTCMonth()]; };
const VBY = Object.fromEntries(venues.map(v => [v.id, v]));
const unified = [
  ...events.map(e => ({ id: e.id, name: e.name, start: e.start, end: e.end, city: e.city, venue: e.venue, country: e.country, driveMin: e.driveMin, for: e.for, tier: e.tier, why: e.why, onSale: e.onSale, planBy: e.planBy, sellOutRisk: e.sellOutRisk, ticketUrl: e.ticketUrl, source: e.source, startTime: e.startTime, status: e.status, lat: e.lat, lng: e.lng })),
  ...concerts.map(c => { const v = c.venueId ? VBY[c.venueId] : { name: c.venueName, city: c.city, country: c.country, driveMin: c.driveMin, lat: c.lat, lng: c.lng }; return { id: c.id, name: c.artist, start: c.date, end: c.date, city: v.city, venue: v.name, country: v.country, driveMin: c.driveMin ?? v.driveMin, for: c.for, tier: c.tier || 3, why: c.why, onSale: c.onSale, planBy: c.planBy, sellOutRisk: c.sellOutRisk, ticketUrl: c.ticketUrl, source: c.source, startTime: c.doors, status: c.status, lat: v.lat, lng: v.lng }; })
].filter(x => x.end >= today && x.status !== "cancelled");
function icsFeed(items, name) {
  const stamp = generated.replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//Rondom//${name}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:Rondom ${name}`, "X-WR-TIMEZONE:Europe/Amsterdam", "REFRESH-INTERVAL;VALUE=DURATION:P1D", "X-PUBLISHED-TTL:P1D",
    "BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT", "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"];
  for (const it of items) {
    const long = (Date.parse(it.end) - Date.parse(it.start)) / 864e5 > 21;
    const desc = [it.why, `Drive about ${it.driveMin} min from Hoensbroek.`, it.sellOutRisk ? `${it.sellOutRisk} sell-out risk.` : null, it.ticketUrl ? "Tickets: " + it.ticketUrl : null, "Source: " + it.source, `Open in Rondom: ${SITE}/#${it.id.includes("-") && concerts.some(c => c.id === it.id) ? "c" : "e"}-${it.id}`].filter(Boolean).join("\n");
    const loc = icsEsc((it.venue ? it.venue + ", " : "") + it.city + ", " + it.country);
    if (long) {
      // A long run becomes one reminder on its first Saturday from today instead of a months-long all-day block.
      let d = it.start > today ? it.start : today; while (new Date(d + "T00:00:00Z").getUTCDay() !== 6) d = addDays(d, 1); if (d > it.end) d = it.end;
      L.push("BEGIN:VEVENT", `UID:rondom-${it.id}@rondom`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(addDays(d, 1))}`, `SUMMARY:${icsEsc("Ongoing: " + it.name + " (until " + dayName(it.end) + ")")}`, `LOCATION:${loc}`, `DESCRIPTION:${icsEsc(desc)}`, it.lat != null ? `GEO:${it.lat};${it.lng}` : null, "END:VEVENT");
    } else {
      L.push("BEGIN:VEVENT", `UID:rondom-${it.id}@rondom`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(it.start)}`, `DTEND;VALUE=DATE:${ymd(addDays(it.end, 1))}`, `SUMMARY:${icsEsc(it.name)}`, `LOCATION:${loc}`, `DESCRIPTION:${icsEsc(desc)}`, it.ticketUrl || it.source ? `URL:${it.ticketUrl || it.source}` : null, it.lat != null ? `GEO:${it.lat};${it.lng}` : null, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Tomorrow: " + it.name)}`, "TRIGGER:-P1D", "END:VALARM", "END:VEVENT");
    }
    if (it.onSale && it.onSale >= today) L.push("BEGIN:VEVENT", `UID:rondom-${it.id}-onsale@rondom`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Amsterdam:${ymd(it.onSale)}T090000`, `DTEND;TZID=Europe/Amsterdam:${ymd(it.onSale)}T093000`, `SUMMARY:${icsEsc("Tickets on sale: " + it.name)}`, `DESCRIPTION:${icsEsc((it.sellOutRisk ? it.sellOutRisk + " sell-out risk. " : "") + (it.ticketUrl || it.source))}`, it.ticketUrl ? `URL:${it.ticketUrl}` : null, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Tickets on sale now: " + it.name)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
    else if (it.planBy && it.planBy >= today && it.planBy > addDays(it.start, -2)) { /* same as the day-before alarm; skip */ }
    else if (it.planBy && it.planBy >= today) L.push("BEGIN:VEVENT", `UID:rondom-${it.id}-planby@rondom`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Amsterdam:${ymd(it.planBy)}T090000`, `DTEND;TZID=Europe/Amsterdam:${ymd(it.planBy)}T093000`, `SUMMARY:${icsEsc("Book by today: " + it.name)}`, `DESCRIPTION:${icsEsc((it.sellOutRisk ? it.sellOutRisk + " sell-out risk. " : "") + (it.ticketUrl || it.source))}`, it.ticketUrl ? `URL:${it.ticketUrl}` : null, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Book today: " + it.name)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.filter(Boolean).map(fold).join("\r\n") + "\r\n";
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
  mkdirSync(new URL("public/calendar/", root), { recursive: true });
  const feeds = { anne: unified.filter(x => x.tier <= 2 && x.for.includes("anne")), alma: unified.filter(x => x.tier <= 2 && x.for.includes("alma")), nick: unified.filter(x => x.tier <= 2 && x.for.includes("nick")), family: unified.filter(x => x.tier <= 2 && x.for.includes("family")), tier1: unified.filter(x => x.tier === 1) };
  for (const [name, items] of Object.entries(feeds)) writeFileSync(new URL(`public/calendar/${name}.ics`, root), icsFeed(items, name));
  console.log(`Built public/: ${summary}, cache out-${version}, calendar feeds ${Object.entries(feeds).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
}
