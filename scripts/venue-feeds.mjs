// Reads the machine-readable agendas of the tracked venues and prints what is not in data/concerts.json yet.
//   node scripts/venue-feeds.mjs [--out file.json] [--all]
// Output: { read: {venue: count}, failed: [...], candidates: [...], cancelled: [...] }. Candidates are raw listings
// (venueId, title, date, doors, start, status, url, priceFrom); the refresh still judges each one against the bar
// (K-pop, stadium, major international act) and writes the concert object. --all prints every listing, not only new ones.
// Feeds: Ziggo Dome API, Lanxess JSON export, D.LIVE calendars (PSD Bank Dome, Mitsubishi Electric Halle), be-at venues
// (AFAS Dome, Lotto Arena, Trixxo Arena Hasselt, Forest National),
// Westfalenhalle event finder (HTML), Festhalle (Messe Frankfurt event API, read through headless Chromium).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const root = new URL("..", import.meta.url);
const args = process.argv.slice(2), ALL = args.includes("--all");
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const today = new Date().toISOString().slice(0, 10);
const concerts = JSON.parse(readFileSync(new URL("data/concerts.json", root), "utf8"));
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();
const get = async (u, o = {}) => { const r = await fetch(u, { headers: { accept: "application/json, text/html", "x-requested-with": "XMLHttpRequest" }, signal: AbortSignal.timeout(30000), ...o }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r; };
const hhmm = s => s ? s.slice(11, 16) : null;
// D.LIVE publishes UTC instants; show them in Düsseldorf local time.
const local = iso => { if (!iso) return [null, null]; const d = new Date(iso); const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(d); return [p.slice(0, 10), p.slice(11, 16)]; };
const list = [], read = {}, failed = [];
const feed = async (name, fn) => { try { const n = list.length; await fn(); read[name] = list.length - n; } catch (e) { failed.push(`${name}: ${e.message.split("\n")[0]}`); } };

await feed("ziggo-dome", async () => {
  // One call returns the whole agenda; the per-show price lives at /api/agenda/events/{id}/ (trailing slash).
  const j = await (await get("https://www.ziggodome.nl/api/agenda/")).json();
  for (const r of j.data || []) list.push({ venueId: "ziggo-dome", title: r.performerName || (r.event && r.event.title) || "", sub: r.event && r.event.title || "", date: (r.showDate || "").slice(0, 10), doors: r.showTimeUnknown ? null : hhmm(r.showDate), start: null, status: r.showState, onSale: (r.salesStartDate || "").slice(0, 10) || null, priceFrom: r.minTicketPrice ?? null, url: `https://www.ziggodome.nl/events/${r.id}`, ticketUrl: r.salesUrl || null });
});
await feed("lanxess-arena", async () => {
  const j = await (await get("https://www.lanxess-arena.de/events-tickets/eventkalender/export/JSON/out.json")).json(); const rows = Array.isArray(j) ? j : (j.eventdates || Object.values(j).find(Array.isArray) || []);
  for (const r of rows) { const ds = r.datestart && r.datestart.date || ""; const text = String(r.text || r.html || ""); const einlass = /Einlass[^0-9]{0,20}(\d{1,2})[:.](\d{2})/.exec(text); list.push({ venueId: "lanxess-arena", title: r.title, sub: r.subtitle || "", date: ds.slice(0, 10), doors: einlass ? einlass[1].padStart(2, "0") + ":" + einlass[2] : null, start: ds.slice(11, 16), status: r.status || null, url: r.uid ? `https://www.lanxess-arena.de/eventdetail/${r.uid}` : "https://www.lanxess-arena.de/" }); }
});
for (const [venueId, host] of [["psd-bank-dome", "www.psd-bank-dome.de"], ["mitsubishi-electric-halle", "www.mitsubishi-electric-halle.de"]]) await feed(venueId, async () => {
  const j = await (await get(`https://${host}/events-tickets/eventkalender/dates?total=9999&vip=false`)).json();
  for (const r of j.dates || []) { const [d, st] = local(r.date && r.date.formatted); const [, dr] = local(r.date && r.date.opening_time); list.push({ venueId, title: r.title, sub: r.description || "", kind: r.type, date: d, doors: dr, start: st, status: r.status, url: `https://${host}${r.url_detail}` }); }
});
await feed("westfalenhalle", async () => {
  const h = await (await get("https://www.westfalenhalle.de/events-tickets/eventfinder/")).text();
  const re = /data-event-uid="(\d+)"\s+data-tstamp="(\d+)">\s*<a href="([^"]+)"[^>]*aria-label="Die Übersichtsseite des (.*?) Event aufrufen"/g; let m;
  while ((m = re.exec(h))) { const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", dateStyle: "short" }).format(new Date(+m[2] * 1000)); list.push({ venueId: "westfalenhalle", title: m[4], date: d, doors: null, start: null, status: null, url: "https://www.westfalenhalle.de" + m[3] }); }
});
await feed("festhalle-frankfurt", async () => {
  // The Messe Frankfurt API needs the page's own key, so let the page call it and read the answer.
  const { chromium } = createRequire(import.meta.url)("playwright"); const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch(proxy ? { proxy: { server: proxy } } : {}); const p = await b.newPage(); let body = null;
  p.on("response", async r => { if (r.url().includes("/event/searchMultiParam/") && r.status() === 200) body = await r.text().catch(() => null); });
  await p.goto("https://festhalle.messefrankfurt.com/frankfurt/de/veranstaltungen.html", { waitUntil: "domcontentloaded", timeout: 45000 }); for (let i = 0; i < 20 && !body; i++) await p.waitForTimeout(1000); await b.close();
  if (!body) throw new Error("no event API answer");
  for (const r of JSON.parse(body).result.hits) list.push({ venueId: "festhalle-frankfurt", title: r.eventname, sub: r.subtitle || "", kind: r.formatname, date: r.startdate, end: r.enddate, doors: null, start: null, status: r.cancelled === "Y" ? "canceled" : r.postponed === "Y" ? "postponed" : null, url: r.interneturl });
});

// be-at venues (AFAS Dome and Lotto Arena in Antwerp, Trixxo Arena in Hasselt, Forest National in Brussels): the pages redirect
// plain clients to a login, but with a cookie jar the sitemap gives the event slugs and Next.js serves each event as JSON.
const curl = (jar, u) => execFileSync("curl", ["-sSL", "-m", "40", "-c", jar, "-b", jar, u], { encoding: "utf8", maxBuffer: 64e6 });
function beatDecode(arr) { const memo = new Map(); const g = i => { if (i < 0) return undefined; if (memo.has(i)) return memo.get(i); const n = arr[i]; let v; if (n[0] === 0) v = n[1]; else if (n[0] === 1) { v = []; memo.set(i, v); for (const j of n[1]) v.push(g(j)); return v; } else if (n[0] === 2) { v = {}; memo.set(i, v); for (const [k, j] of n[1]) v[g(k)] = g(j); return v; } memo.set(i, v); return v; }; return g(0); }
for (const [venueId, host] of [["sportpaleis-antwerp", "www.afas-dome.be"], ["lotto-arena", "www.lotto-arena.be"], ["trixxo-arena", "www.trixxo-arena.be"], ["forest-national", "www.vorst-nationaal.be"]]) await feed(venueId, async () => {
  const jar = mkdtempSync(tmpdir() + "/beat-") + "/cj.txt";
  const home = curl(jar, `https://${host}/`); const build = (/"buildId":"([^"]+)"/.exec(home) || [])[1]; if (!build) throw new Error("no buildId (login wall)");
  const slugs = [...new Set([...curl(jar, `https://${host}/sitemap.xml`).matchAll(/<loc>https:\/\/[^<]*?\/evenement\/([^<\/]+)</g)].map(m => m[1]))];
  for (const slug of slugs) {
    let d; try { d = JSON.parse(curl(jar, `https://${host}/_next/data/${build}/nl/evenement/${slug}.json`)); } catch (e) { continue; }
    const pd = d.pageProps && d.pageProps.pageData; if (!pd) continue; const c = (Array.isArray(pd) ? beatDecode(pd) : pd).content || {};
    if (c.eventTimeStatus === "ended") continue;
    const dates = [...String(c.date || "").matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)].map(m => `${m[3]}-${m[2]}-${m[1]}`);
    for (const date of dates) list.push({ venueId, title: c.name, sub: c.tourName || "", date, doors: null, start: null, status: c.statusCta && c.statusCta.label || null, url: `https://${host}/evenement/${slug}` });
  }
});

const known = new Set(concerts.map(c => `${c.venueId}|${c.date}|${norm(c.artist).split(" ")[0]}`));
const knownDay = new Set(concerts.map(c => `${c.venueId}|${c.date}`));
const future = list.filter(x => x.date && x.date >= today);
const isCancel = x => /cancel/i.test(x.status || "");
const candidates = future.filter(x => !isCancel(x) && (ALL || !known.has(`${x.venueId}|${x.date}|${norm(x.title).split(" ")[0]}`))).map(x => ({ ...x, sameDayInData: knownDay.has(`${x.venueId}|${x.date}`) || undefined }));
// Listings that the venue marks cancelled or postponed and that match an entry in the data.
const cancelled = future.filter(x => /cancel|postpon/i.test(x.status || "")).map(x => { const c = concerts.find(c => c.venueId === x.venueId && c.date === x.date && norm(c.artist).split(" ")[0] === norm(x.title).split(" ")[0]); return c ? { id: c.id, venueStatus: x.status, url: x.url } : null; }).filter(Boolean);
// Entries in the data that a fully read venue no longer lists at all.
const full = new Set(Object.keys(read).filter(v => read[v] > 0));
const first = t => norm(t).split(" ").find(w => w.length > 2 && !["the", "die", "der", "les"].includes(w)) || norm(t);
const missing = concerts.filter(c => full.has(c.venueId) && c.date >= today && !future.some(x => x.venueId === c.venueId && (x.date === c.date || first(x.title) === first(c.artist)))).map(c => ({ id: c.id, artist: c.artist, date: c.date, confidence: c.confidence }));
const out = { today, read, failed, candidates, cancelled, missingFromVenue: missing };
if (outFile) { writeFileSync(outFile, JSON.stringify(out, null, 1)); console.log(JSON.stringify({ read, failed, candidates: candidates.length, cancelled: cancelled.length, missingFromVenue: missing.length }, null, 1)); }
else console.log(JSON.stringify(out, null, 1));
