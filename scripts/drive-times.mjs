// Fills driveMin from Hoensbroek using the public OSRM demo router, rounded to 5 minutes.
//   node scripts/drive-times.mjs                 -> fills entries whose driveMin is null in data/venues.json, data/events.json, data/concerts.json
//   node scripts/drive-times.mjs --all           -> recomputes every entry
//   node scripts/drive-times.mjs --check 5.9 50.9  -> prints the drive time to one point
// Calibrated against the ChristmasMarket26 drive times (mean ratio 1.00 over 23 cities).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const root = new URL("..", import.meta.url);
const HOME = { lat: 50.9128, lng: 5.9268 };
const ALL = process.argv.includes("--all");
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function route(lat, lng) {
  const u = `https://router.project-osrm.org/route/v1/driving/${HOME.lng},${HOME.lat};${lng},${lat}?overview=false`;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u).then(r => r.json()); if (r.code === "Ok") return Math.max(5, Math.round(r.routes[0].duration / 60 / 5) * 5); } catch (e) {}
    await sleep(1500 * (i + 1));
  }
  return null;
}
const ci = process.argv.indexOf("--check");
if (ci > -1) { console.log(await route(+process.argv[ci + 2], +process.argv[ci + 1]), "min"); process.exit(0); }
for (const f of ["data/venues.json", "data/events.json", "data/concerts.json"]) {
  const p = new URL(f, root); if (!existsSync(p)) continue;
  const list = JSON.parse(readFileSync(p, "utf8")); let n = 0;
  for (const e of list) {
    if (e.lat == null || e.lng == null) continue;
    if (!ALL && e.driveMin != null) continue;
    const d = await route(e.lat, e.lng); if (d == null) { console.error(`${f}: no route for ${e.id}`); continue; }
    e.driveMin = d; n++; await sleep(250);
  }
  if (n) writeFileSync(p, JSON.stringify(list, null, 1) + "\n");
  console.log(`${f}: ${n} drive times filled`);
}
