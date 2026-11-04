# Rondom

Weekends worth the drive from Hoensbroek. A phone-first web app that lists festivals, concerts and K-pop, military and aviation days, sport, museum blockbusters, food and culture within three hours of home (concerts within five), scores them for the people going, and keeps a plan with calendar and PDF export. Static site, no backend, works offline once opened. The data is researched and refreshed by a weekly Claude Code scheduled task.

Version 1.0.0. Data checked 4 Nov 2026.

## Layout

```
public/                 What Vercel serves
  index.html            Built app (generated, do not edit by hand)
  sw.js                 Service worker (generated)
  manifest.webmanifest  Home-screen install
  icons/                App icons (favicon.svg is the source; PNGs come from scripts/icons.mjs)
  vendor/               jsPDF 2.5.1, served locally
src/
  index.template.html   App source: markup, styles, script
  sw.template.js        Service worker source
data/
  events.json           Events (edit this)
  concerts.json         Concerts (separate 5-hour radius)
  venues.json           Tracked concert venues with agenda URLs
  geo.json              Country outlines for the map
  meta.json             Version, "data checked" date, build date
  CHANGELOG.md          Data changes, newest first
docs/UPDATE.md          Weekly refresh procedure
scripts/build.mjs       Validates data and builds public/ (no dependencies)
scripts/triage.mjs      What to re-check this week
scripts/drive-times.mjs Drive times from Hoensbroek via OSRM
BACKLOG.md              Bugs and unverified items
vercel.json             Build settings and headers
```

## How it picks

Every entry gets a score in the browser: tier (60, 35 or 15), proximity (up to 25), a match for each selected person (10 each, up to 20), urgency (10 if you must act within 14 days), newness (5) and season (5), minus penalties for sold out or hidden entries. Home shows the three best picks for the coming weekend (one per lane where possible), one pick per person for the next 60 days, and the tier 1 entry with the nearest book-by date. Each pick shows its reasons. Entries within 30 minutes (Parkstad, Maastricht, Sittard, Aachen) carry a "Nearby" tag, and the "Nearby only" chip filters every view to them. "Not interested" hides an entry; "More like this" lifts similar entries; the settings panel weights each person.

## Update the data

Working in Claude Code? `CLAUDE.md` has the project rules and `docs/UPDATE.md` is the weekly refresh procedure. By hand:

1. Edit `data/events.json` or `data/concerts.json` with a small script. Each entry needs a stable `id`, dates, `tier`, `for`, `confidence`, `source`, `addedOn` and `status`; the full schema is in `CLAUDE.md`.
2. Run `node scripts/drive-times.mjs` for entries with `driveMin: null`.
3. Set `checked` in `data/meta.json`.
4. Run `node scripts/build.mjs`. It fails loudly on a bad edit.
5. Commit and push. Vercel rebuilds automatically.

## Run locally

```
node scripts/build.mjs
npx serve public
```

## Deploy

The repo deploys as-is on Vercel: `vercel.json` sets the build command, the output directory (`public`) and cache headers. Import `ndubaz/ToDoNL` and keep the defaults.

`node scripts/build.mjs --artifact` builds `dist/artifact.html`, the single-file version for the claude.ai artifact.

## Install on iPhone

1. Open the site in Safari.
2. Tap Share, then Add to Home Screen, then Add.
3. Open it from the home screen. It runs full screen with the dark status bar and keeps working offline.

## Notes

- Your plan, notes, hidden entries, likes and weights live in the browser's localStorage on each device. They are not synced between devices. Use Settings, then Export as JSON, and import the file on the other device.
- The Plan tab's "Add to calendar (.ics)" file holds one all-day event per saved entry with a reminder the day before, plus a 09:00 reminder on each ticket on-sale date. Open it on the iPhone and add it to Calendar; that is the cross-device reminder path until push notifications exist.
- Entries marked "projected" come from the usual annual pattern or a not yet updated official page. Check the official link before you book or drive.
- Drive times are off-peak routing estimates from Hoensbroek, rounded to 5 minutes.
