// Scans venue agendas, promoter and label pages, lead sites and artists' own tour pages for the acts on data/watchlist.json
// (K-pop, K-pop adjacent, Italian, Eurovision) and prints what is not in data/concerts.json or data/events.json yet.
//   node scripts/tour-watch.mjs [--out file.json] [--feeds feeds.json] [--only <sourceId,...>] [--no-tour-pages]
// --feeds also matches the listings that scripts/venue-feeds.mjs found at the big halls.
// Output: { hits: [...], placeHits: [...], genreHits: [...], read: {...}, failed: [...] }.
//   hits       a watchlist name seen on a source, with the text around it and the nearest date. near: the source is a venue near
//              home, a venue feed, or a radius city is named beside it (these are concert candidates; the rest feed the Tour radar).
//              tribute: the text calls it a tribute or cover show (not the real act). inData: dates we already hold for the act.
//   placeHits  a radius city named on an artist's own tour page, with the text around it
//   genreHits  a genre tag (K-pop, Eurovision, Italian) seen on a venue agenda, with the text around it
// Every hit is a lead to check, not an entry: confirm on an official page before adding it (docs/UPDATE.md step 2).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("..", import.meta.url);
const rd = f => JSON.parse(readFileSync(new URL(f, root), "utf8"));
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
const W = rd("data/watchlist.json"), concerts = rd("data/concerts.json"), events = rd("data/events.json");
const only = opt("--only") ? new Set(opt("--only").split(",")) : null;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const today = new Date().toISOString().slice(0, 10);
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const strip = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|article|section)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z]+;|&#\d+;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");

/* ---------- reading ---------- */
let browser = null;
async function rendered(url, scrolls = 6, more = null) {
  if (!browser) { const { chromium } = createRequire(import.meta.url)("playwright"); const proxy = process.env.HTTPS_PROXY || process.env.https_proxy; browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {}); }
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-GB", viewport: { width: 1280, height: 2200 } }); const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }); await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    for (const t of ["Alle akzeptieren", "Accept all", "Alles accepteren", "Tout accepter", "Akzeptieren", "Accepteren", "Accepter"]) { const b = p.getByRole("button", { name: t }).first(); if (await b.count().catch(() => 0)) { await b.click({ timeout: 2000 }).catch(() => {}); break; } }
    for (let i = 0; i < scrolls; i++) { await p.mouse.wheel(0, 7000); await p.waitForTimeout(600); if (more) { const b = p.getByText(more, { exact: false }).last(); if (await b.count().catch(() => 0)) { await b.click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(1000); } } }
    return await p.evaluate(() => document.body.innerText);
  } finally { await ctx.close(); }
}
async function fetched(url) { const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json" }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const t = await r.text(); return /^\s*[\[{]/.test(t) ? t : strip(t); }
async function readSource(s) {
  const urls = s.pages ? Array.from({ length: s.pages.to - s.pages.from + 1 }, (_, i) => s.pages.pattern.replace("{n}", s.pages.from + i)) : [s.url];
  const parts = [];
  for (const u of urls) { try { parts.push(s.mode === "browser" ? await rendered(u, s.scrolls ?? 6, s.more || null) : await fetched(u)); } catch (e) { if (!parts.length && urls.length === 1) throw e; break; } }
  return parts.join("\n");
}

/* ---------- matching ---------- */
const MON = "jan|feb|mrt|maa|mar|apr|mei|may|jun|jul|aug|sep|sept|okt|oct|nov|dec|dez|mär|mai|janv|févr|fevr|mars|avr|juin|juil|août|aout|déc|gen|giu|lug|ago|set|ott|dic";
const DATE = new RegExp(`\\b(\\d{1,2}[./-]\\d{1,2}[./-](20)?\\d{2}|\\d{1,2}(st|nd|rd|th|er)?\\.?\\s+(${MON})[a-zé]*\\.?(\\s+'?(20)?\\d{2})?|(${MON})[a-zé]*\\.?\\s+\\d{1,2}(,?\\s+(20)?\\d{2})?|20\\d{2}-\\d{2}-\\d{2})\\b`, "gi");
const PLACES = ["Amsterdam", "Rotterdam", "Utrecht", "Den Haag", "The Hague", "Tilburg", "Eindhoven", "Arnhem", "Nijmegen", "Maastricht", "Kerkrade", "Groningen",
  "Brussels", "Bruxelles", "Brussel", "Antwerp", "Antwerpen", "Anvers", "Ghent", "Gent", "Gand", "Liège", "Luik", "Hasselt", "Leuven", "Luxembourg", "Luxemburg", "Esch",
  "Köln", "Koeln", "Cologne", "Düsseldorf", "Duesseldorf", "Dusseldorf", "Dortmund", "Oberhausen", "Essen", "Bochum", "Gelsenkirchen", "Bonn", "Aachen", "Münster", "Frankfurt", "Offenbach", "Mainz", "Wiesbaden", "Mannheim", "Hannover",
  "Paris", "Nanterre", "Saint-Denis", "Lille", "Metz", "Nancy", "Reims", "Strasbourg"];
const PLACE_RE = new RegExp(`\\b(${PLACES.map(esc).join("|")})\\b`, "g");
// Names that are ordinary words, or very short, match only in the exact letter case given in the watchlist.
const artists = W.artists.map(a => {
  const ex = a.exclude ? new RegExp(a.exclude, "i") : null; const names = [a.name, ...(a.aliases || [])].filter(n => n && n.length >= 2); return { ...a, ex, res: names.map(n => { const cs = a.caseSensitive || n.length <= 4; return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(cs ? n : norm(n))}(?=$|[^\\p{L}\\p{N}])`, cs ? "u" : "iu"); }) }; });
const genres = (W.genreTags || []).map(g => ({ ...g, re: new RegExp(g.pattern, "i") }));
const ctx = (t, i, n = 170) => t.slice(Math.max(0, i - n), i + n).replace(/\s+/g, " ").trim();
const datesIn = s => [...new Set((s.match(DATE) || []).map(x => x.trim()))].slice(0, 4);
// The date printed closest to the name, before or after it, is usually that show's date on an agenda page.
const nearest = (t, i) => { const w = t.slice(Math.max(0, i - 220), i + 220), c = Math.min(i, 220); let best = null, bd = 1e9; for (const m of w.matchAll(new RegExp(DATE.source, "gi"))) { const d = Math.abs(m.index - c); if (d < bd) { bd = d; best = m[0].trim(); } } return best; };
function scanNames(text, source) {
  const out = [], low = norm(text);
  for (const a of artists) for (const re of a.res) {
    const hay = re.flags.includes("i") ? low : text; const g = new RegExp(re.source, re.flags + "g"); let m, n = 0;
    while ((m = g.exec(hay)) && n < 6) { n++; const i = m.index + m[1].length; const c = ctx(text, i); if (a.ex && a.ex.test(ctx(text, i, 40))) continue; const tribute = /tribute|cover show|sensations|superstars|showdown/i.test(ctx(text, i, 90)); out.push({ artist: a.name, group: a.group, source: source.id, official: !!source.official, city: source.city || null, url: source.url || (source.pages && source.pages.pattern.replace("{n}", source.pages.from)), date: nearest(text, i), dates: datesIn(c), tribute: tribute || undefined, near: !!(source.kind === "venue" || source.near || String(source.id).startsWith("feed:") || new RegExp(PLACE_RE.source).test(ctx(text, i, 120))), context: c }); }
  }
  return out;
}
function scanGenres(text, source) {
  const out = [];
  for (const g of genres) { const r = new RegExp(g.re.source, "gi"); let m, n = 0; while ((m = r.exec(text)) && n < 10) { n++; const c = ctx(text, m.index, 200); out.push({ tag: g.group, source: source.id, city: source.city || null, date: nearest(text, m.index), dates: datesIn(c), context: c }); } }
  return out;
}

/* ---------- known entries ---------- */
const known = [...concerts.map(c => ({ name: norm(c.artist), date: c.date })), ...events.map(e => ({ name: norm(e.name), date: e.start, end: e.end }))].filter(x => (x.end || x.date) >= today);
const knownFor = name => known.filter(k => k.name.includes(norm(name)));

/* ---------- run ---------- */
const read = {}, failed = [], hits = [], genreHits = [], placeHits = [];
for (const s of W.sources) {
  if (only && !only.has(s.id)) continue;
  try { const t = await readSource(s); read[s.id] = t.length; hits.push(...scanNames(t, s)); if (s.kind === "venue") genreHits.push(...scanGenres(t, s)); }
  catch (e) { failed.push(`${s.id}: ${e.message.split("\n")[0]}`); }
}
if (!args.includes("--no-tour-pages") && !only) for (const a of W.artists.filter(a => a.tourUrl)) {
  try {
    const t = a.tourMode === "browser" ? await rendered(a.tourUrl, 3) : await fetched(a.tourUrl); read["tour:" + a.name] = t.length;
    const g = new RegExp(PLACE_RE.source, "g"); let m; const seen = new Set();
    while ((m = g.exec(t))) { const c = ctx(t, m.index, 120); const key = m[1] + datesIn(c).join(); if (seen.has(key)) continue; seen.add(key); placeHits.push({ artist: a.name, group: a.group, place: m[1], url: a.tourUrl, date: nearest(t, m.index), dates: datesIn(c), context: c }); }
  } catch (e) { failed.push(`tour:${a.name}: ${e.message.split("\n")[0]}`); }
}
const feedsFile = opt("--feeds");
if (feedsFile) { const f = JSON.parse(readFileSync(feedsFile, "utf8")); for (const c of f.candidates || []) for (const h of scanNames(`${c.title} ${c.sub || ""}`, { id: "feed:" + c.venueId, official: true, url: c.url })) hits.push({ ...h, near: true, date: c.date, dates: [c.date], context: `${c.date} ${c.title}${c.sub ? " (" + c.sub + ")" : ""} at ${c.venueId}` }); }
if (browser) await browser.close();

// Tag each hit with the entries we already hold for that act, so a reviewer sees at a glance whether it is new.
const tag = h => { const k = knownFor(h.artist); return { ...h, inData: k.length ? k.map(x => x.date).slice(0, 6) : undefined }; };
const dedupe = (arr, key) => { const s = new Set(); return arr.filter(x => { const k = key(x); if (s.has(k)) return false; s.add(k); return true; }); };
const out = { today, read, failed,
  hits: dedupe(hits.map(tag), h => h.artist + "|" + h.source + "|" + (h.date || h.dates.join())).sort((a, b) => (b.near && !b.inData && !b.tribute) - (a.near && !a.inData && !a.tribute)),
  placeHits: dedupe(placeHits.map(tag), h => h.artist + "|" + h.place + "|" + h.dates.join()),
  genreHits: dedupe(genreHits, h => h.source + "|" + h.context.slice(0, 80)) };
const file = opt("--out");
if (file) { writeFileSync(file, JSON.stringify(out, null, 1)); console.log(JSON.stringify({ read: Object.keys(read).length, failed: failed.length, hits: out.hits.length, newHits: out.hits.filter(h => !h.inData).length, newNearHits: out.hits.filter(h => !h.inData && h.near && !h.tribute).length, placeHits: out.placeHits.length, genreHits: out.genreHits.length }, null, 1)); }
else console.log(JSON.stringify(out, null, 1));
