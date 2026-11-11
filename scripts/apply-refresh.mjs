// Applies a weekly refresh to data/ from JSON files produced by the research steps. No dependencies.
//   node scripts/apply-refresh.mjs --dir <folder> [--today YYYY-MM-DD]
// The folder may hold any of:
//   venue-new.json, discovery-concerts.json   arrays of concert objects to add
//   discovery-events.json                     array of event objects to add
//   venue-changes.json                        [{id, status, note, source}]
//   confirm-soon.json, confirm-projected.json [{id, fetched, changes: {field: value}, note}]
// It removes ended entries and cancelled entries older than 30 days, applies the changes (status flips get changedOn and
// prevStatus, date changes get a dateNote, every fetched entry gets verifiedOn), adds new entries (drive time from OSRM,
// addedOn today), recomputes planBy for every entry, sets meta.json, and prints a summary for the changelog and the report.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const root = new URL("..", import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const TODAY = arg("--today", new Date().toISOString().slice(0, 10));
const DIR = arg("--dir", null); if (!DIR) { console.error("--dir is required"); process.exit(1); }
const load = f => { const p = DIR.replace(/\/$/, "") + "/" + f; return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : []; };
const rd = f => JSON.parse(readFileSync(new URL(f, root), "utf8"));
const E = rd("data/events.json"), C = rd("data/concerts.json"), V = rd("data/venues.json"), META = rd("data/meta.json");
const VBY = Object.fromEntries(V.map(v => [v.id, v]));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const fmt = d => { const x = new Date(d + "T00:00:00Z"); return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const min = (a, b) => a < b ? a : b;
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const summary = { removed: [], statusChanges: [], dateChanges: [], confirmed: [], added: [], failed: [], verified: 0, onSaleSoon: [] };

function planBy(x, start) {
  const risk = x.sellOutRisk, os = x.onSale; let p;
  if (risk === "high") p = os && os >= TODAY ? os : addDays(start, -30);
  else if (risk === "medium") p = os && os >= addDays(TODAY, -7) ? addDays(os, 7) : addDays(start, -21);
  else p = addDays(start, -14);
  p = min(p, start); return p < TODAY ? null : p;
}
async function driveMin(lat, lng) {
  const u = `https://router.project-osrm.org/route/v1/driving/5.9268,50.9128;${lng},${lat}?overview=false`;
  for (let i = 0; i < 3; i++) { try { const r = await fetch(u).then(r => r.json()); if (r.code === "Ok") return Math.max(5, Math.round(r.routes[0].duration / 60 / 5) * 5); } catch (e) {} await sleep(1500 * (i + 1)); }
  return null;
}

/* 1. removals */
for (const [arr, kind] of [[E, "event"], [C, "concert"]]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const x = arr[i], end = x.end || x.date;
    if (end < TODAY) { summary.removed.push(`${kind} ${x.id} (ended ${end})`); arr.splice(i, 1); }
    else if (x.status === "cancelled" && x.changedOn && x.changedOn < addDays(TODAY, -30)) { summary.removed.push(`${kind} ${x.id} (cancelled, 30 days shown)`); arr.splice(i, 1); }
  }
}
const byId = {}; [...E, ...C].forEach(x => byId[x.id] = x);

/* 2. changes */
const DATEF = ["start", "end", "days", "date"];
function applyChange(id, changes, note, fetched) {
  const x = byId[id]; if (!x) { summary.failed.push(`change for unknown id ${id}`); return; }
  if (fetched !== false) { x.verifiedOn = TODAY; summary.verified++; }
  if (!changes || !Object.keys(changes).length) return;
  if (changes.confidence === "projected" && x.confidence === "confirmed") delete changes.confidence; // never downgrade
  const isEvent = "start" in x;
  if (changes.date && isEvent) { changes.start = changes.date; changes.end = changes.end || changes.date; delete changes.date; }
  if (changes.status && changes.status !== x.status) { x.prevStatus = x.status; x.changedOn = TODAY; summary.statusChanges.push(`${x.name || x.artist}: ${x.status} to ${changes.status}`); }
  const dateChanged = DATEF.some(k => k in changes && JSON.stringify(changes[k]) !== JSON.stringify(x[k]));
  if (dateChanged) {
    const oldD = isEvent ? `${x.start}${x.end !== x.start ? " to " + x.end : ""}` : x.date;
    for (const k of DATEF) if (k in changes) x[k] = changes[k];
    if (isEvent && x.days && x.days.length) { x.days = [...new Set(x.days)].sort(); x.start = x.days[0]; x.end = x.days[x.days.length - 1]; }
    const newD = isEvent ? `${x.start}${x.end !== x.start ? " to " + x.end : ""}` : x.date;
    const confirmedNow = changes.confidence === "confirmed" && x.confidence !== "confirmed";
    x.dateNote = `Dates ${confirmedNow ? "confirmed" : "corrected"} on ${fmt(TODAY)}.`;
    (confirmedNow ? summary.confirmed : summary.dateChanges).push(`${x.name || x.artist}: ${oldD} to ${newD}`);
  } else if (changes.confidence === "confirmed" && x.confidence !== "confirmed") { x.dateNote = `Dates confirmed on ${fmt(TODAY)}.`; summary.confirmed.push(`${x.name || x.artist}: ${isEvent ? x.start : x.date} confirmed`); }
  for (const [k, v] of Object.entries(changes)) { if (DATEF.includes(k)) continue; if (k === "status" || k === "confidence" || ["times", "startTime", "onSale", "sellOutRisk", "priceFrom", "ticketNote", "ticketUrl", "source", "doors", "dateNote", "highlights", "tip", "venue", "cityNote"].includes(k)) x[k] = v; }
  if (x.confidence === "confirmed" && x.status === "tbd") x.status = "announced";
  if (x.confidence === "projected" && x.status === "onsale") x.status = "announced";
  if (note && /cancel/i.test(note) && x.status !== "cancelled") summary.failed.push(`${id}: note mentions cancellation but status is ${x.status}; check`);
}
for (const c of load("confirm-soon.json")) applyChange(c.id, c.changes, c.note, c.fetched);
for (const c of load("confirm-projected.json")) applyChange(c.id, c.changes, c.note, c.fetched);
for (const c of load("venue-changes.json")) applyChange(c.id, { status: c.status, ...(c.source ? { source: c.source } : {}) }, c.note, true);

/* 3. additions */
const STAD = new Set(["johan-cruijff-arena", "gelredome", "deutsche-bank-park", "stade-de-france", "parkstad-limburg-stadion"]);
const nameKey = x => norm(x.name || x.artist) + "|" + (x.start || x.date);
const keys = new Set([...E, ...C].map(nameKey));
for (const e of load("discovery-events.json")) {
  if (byId[e.id] || keys.has(nameKey(e))) { summary.failed.push(`skip duplicate event ${e.id}`); continue; }
  if (!e.end || !e.start) { summary.failed.push(`skip ${e.id}: no dates`); continue; }
  if (e.driveMin == null && e.lat != null) e.driveMin = await driveMin(e.lat, e.lng);
  if (e.driveMin == null) summary.failed.push(`${e.id}: no drive time yet (OSRM), left null`);
  else if (e.driveMin > (e.tierException ? 300 : 180)) { if (e.tier === 1 && e.driveMin <= 240) { e.tierException = true; e.driveNote = "Tier 1 radius exception: just over three hours"; } else { summary.failed.push(`skip ${e.id}: ${e.driveMin} min is outside the radius`); continue; } }
  if (e.region === "Limburg") e.region = e.country === "BE" ? "Limburg (BE)" : "Limburg (NL)";
  e.status = e.status || (e.confidence === "projected" ? "tbd" : "announced"); if (e.confidence === "projected" && e.status === "onsale") e.status = "announced";
  e.annual = !!e.annual; e.tags = e.tags || []; e.for = e.for && e.for.length ? e.for : ["family"];
  if (e.onSale && e.onSale > e.start) e.onSale = null;
  if (e.days && e.days.length) { e.days = [...new Set(e.days)].sort(); e.start = e.days[0]; e.end = e.days[e.days.length - 1]; }
  e.addedOn = TODAY; if (e.confidence === "confirmed") e.verifiedOn = TODAY;
  E.push(e); byId[e.id] = e; keys.add(nameKey(e)); summary.added.push(`event ${e.kind} tier ${e.tier}: ${e.name} (${e.start}, ${e.city}, ${e.confidence})`);
}
for (const c of [...load("venue-new.json"), ...load("discovery-concerts.json")]) {
  if (byId[c.id] || keys.has(nameKey(c))) { summary.failed.push(`skip duplicate concert ${c.id}`); continue; }
  if (!c.date) { summary.failed.push(`skip ${c.id}: no date`); continue; }
  if (c.venueId && !VBY[c.venueId]) { c.venueName = c.venueName || c.venueId; c.venueId = null; }
  if (!c.venueId) { if (c.lat == null) { summary.failed.push(`skip ${c.id}: no venue coordinates`); continue; } if (c.driveMin == null) c.driveMin = await driveMin(c.lat, c.lng); if (c.driveMin != null && c.driveMin > 300) { summary.failed.push(`skip ${c.id}: ${c.driveMin} min`); continue; } }
  else { delete c.lat; delete c.lng; delete c.city; delete c.venueName; }
  if (!c.for || !c.for.length) { summary.failed.push(`skip ${c.id}: for nobody in the household`); continue; }
  const v = c.venueId ? VBY[c.venueId] : { name: c.venueName, city: c.city };
  c.tier = c.tier || (c.genre === "kpop" || STAD.has(c.venueId) ? 1 : (c.sellOutRisk === "high" || c.sellOutRisk === "medium") ? 2 : 3);
  if (c.genre === "kpop") c.sellOutRisk = "high";
  c.why = c.why || ((c.tour ? c.tour + " at " : "Live at ") + v.name + (v.city ? ", " + v.city : "") + ".");
  c.doors = c.doors || null; c.tags = c.tags || []; c.status = c.status || "announced";
  if (c.confidence === "projected" && c.status === "onsale") c.status = "announced";
  if (typeof c.priceFrom === "string") { const n = parseFloat(c.priceFrom); c.priceFrom = isNaN(n) ? null : n; }
  if (c.onSale && c.onSale > c.date) c.onSale = null;
  c.addedOn = TODAY; if (c.confidence === "confirmed") c.verifiedOn = TODAY;
  C.push(c); byId[c.id] = c; keys.add(nameKey(c)); summary.added.push(`concert ${c.genre} tier ${c.tier}: ${c.artist} (${c.date}, ${v.name}, ${c.confidence})`);
}

/* 4. planBy for everyone, sort, write */
E.forEach(e => { e.planBy = planBy(e, e.start); }); C.forEach(c => { c.planBy = planBy(c, c.date); });
E.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)); C.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
[...E, ...C].forEach(x => { const d = x.onSale && x.onSale >= TODAY && x.onSale <= addDays(TODAY, 14) ? x.onSale : null; if (d) summary.onSaleSoon.push(`${x.name || x.artist}: ${d}`); });
writeFileSync(new URL("data/events.json", root), JSON.stringify(E, null, 1) + "\n");
writeFileSync(new URL("data/concerts.json", root), JSON.stringify(C, null, 1) + "\n");
const b = TODAY.split("-"); META.checked = `${+b[2]} ${MON[+b[1] - 1]} ${b[0]}`; META.built = TODAY;
writeFileSync(new URL("data/meta.json", root), JSON.stringify(META) + "\n");
console.log(JSON.stringify({ today: TODAY, events: E.length, concerts: C.length, ...summary }, null, 1));
