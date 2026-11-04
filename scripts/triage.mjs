// Prints what the weekly refresh should re-check, as compact JSON.
//   node scripts/triage.mjs [--days 45] [--max 80]
// Sections: soon (starting or going on sale within N days), projected (all), stale (not verified in 60 days), venues (listing URLs to sweep).
import { readFileSync } from "node:fs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? +process.argv[i + 1] : d; };
const DAYS = arg("--days", 45), MAX = arg("--max", 80);
const root = new URL("..", import.meta.url);
const load = f => JSON.parse(readFileSync(new URL(f, root), "utf8"));
const events = load("data/events.json"), concerts = load("data/concerts.json"), venues = load("data/venues.json");
const today = new Date().toISOString().slice(0, 10);
const plus = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const horizon = plus(DAYS), staleBefore = plus(-60);
const all = [...events.map(e => ({ ...e, type: "event", first: e.start })), ...concerts.map(c => ({ ...c, type: "concert", name: c.artist, first: c.date, end: c.date }))].filter(x => x.end >= today && x.status !== "cancelled");
const row = x => ({ id: x.id, type: x.type, name: x.name, first: x.first, end: x.end, status: x.status, confidence: x.confidence, onSale: x.onSale || null, planBy: x.planBy || null, verifiedOn: x.verifiedOn || null, source: x.source, ticketUrl: x.ticketUrl || null });
const soon = all.filter(x => (x.first >= today && x.first <= horizon) || (x.onSale && x.onSale >= today && x.onSale <= horizon) || (x.planBy && x.planBy >= today && x.planBy <= horizon)).sort((a, b) => (a.onSale || a.first).localeCompare(b.onSale || b.first));
const projected = all.filter(x => x.confidence === "projected").sort((a, b) => a.first.localeCompare(b.first));
const stale = all.filter(x => !soon.includes(x) && !projected.includes(x) && (!x.verifiedOn || x.verifiedOn < staleBefore)).sort((a, b) => (a.verifiedOn || "0").localeCompare(b.verifiedOn || "0"));
const expired = [...events, ...concerts].filter(x => (x.end || x.date) < today).map(x => x.id);
const cancelledOld = [...events, ...concerts].filter(x => x.status === "cancelled" && x.changedOn && x.changedOn < plus(-30)).map(x => x.id);
const out = { today, horizon, live: all.length, soon: soon.slice(0, MAX).map(row), projected: projected.slice(0, MAX).map(row), stale: stale.slice(0, Math.max(0, MAX - Math.min(MAX, soon.length))).map(row), removeExpired: expired, removeCancelled: cancelledOld, venues: venues.map(v => ({ id: v.id, listingsUrl: v.listingsUrl })) };
console.log(JSON.stringify(out, null, 1));
