# Rondom

Nick's phone-first web app for events worth a drive from Hoensbroek, NL (next to Heerlen): festivals and spectacle, concerts and K-pop, military and aviation days, sport, museum blockbusters, food and culture. Events sit within 3 hours by car, concerts within 5 hours. Three people with distinct interests (Anne: spectacle; Alma, 14: K-pop and teen-friendly spectacle; Nick: military, aviation, world-class culture) plus Family picks. The browser only displays, scores, filters, saves and exports. A weekly Claude Code scheduled task researches and refreshes the data. There is no backend. Dark theme only, body text at 7:1 contrast or better.

## What lives where

- `data/events.json` is the single source of truth for events. `data/concerts.json` holds concerts (separate radius), `data/venues.json` the tracked concert venues, `data/meta.json` the version and "data checked" date, `data/geo.json` the map outlines.
- `src/index.template.html` is the whole app: HTML, CSS and vanilla JS. No framework, no npm dependencies. `src/sw.template.js` is the service worker.
- `scripts/build.mjs` validates the data and builds `public/index.html` + `public/sw.js` (Vercel). With `--artifact`, it builds `dist/artifact.html` (claude.ai artifact, single file, icon inlined).
- `scripts/triage.mjs` prints what the weekly refresh should re-check. `scripts/drive-times.mjs` fills `driveMin` from the OSRM router. `scripts/icons.mjs` renders the PNG icons from `public/icons/favicon.svg`.
- `docs/UPDATE.md` is the weekly refresh procedure. Follow it exactly for scheduled runs.
- `data/CHANGELOG.md` records data changes, newest first. `BACKLOG.md` lists bugs, shortcuts and unverified items; fix them in one batch when Nick says "execute the backlog".
- `vercel.json` sets the build (`node scripts/build.mjs`), the output directory (`public`) and cache headers.

## Commands

```
node scripts/build.mjs              # build the Vercel site (run after every data edit; it fails on bad data)
node scripts/build.mjs --artifact   # build the claude.ai artifact version
node scripts/triage.mjs --days 45 --max 80
node scripts/drive-times.mjs        # fill driveMin for entries where it is null (OSRM, rounded to 5 min)
node scripts/icons.mjs              # re-render PNG icons after changing favicon.svg
npx serve public                    # local preview
```

## Deployment

- **GitHub:** `ndubaz/ToDoNL`, branch `main`. Vercel auto-deploys every push to `main`.
- **Vercel:** Hobby account `ndubaz-5533`, team id `team_O5dGajZMxTjDlfCmwOIKjT5w`, project `todonl`. If no project is linked to the repo, link it with the Vercel MCP `create_git_project` (repo `ndubaz/ToDoNL`, that team id).
- **claude.ai artifact:** https://claude.ai/artifact/MwmFC7k4pnbxmz8YgtCswb. Republish with `dist/artifact.html`; keep its title and the `downloads` capability (the PDF and ICS exports use it).
- **Scheduled task:** "Rondom weekly refresh" (trigger id `trig_01XLn8g4zex7pgu9Nwvy4EPx`), every Wednesday 02:30 Europe/Amsterdam, prompt "Open the repo ndubaz/ToDoNL on main and follow docs/UPDATE.md exactly."

## Data schema

### `data/events.json` (array)

- **Required:** `id` (stable lowercase slug, `<name>-<yyyy>`), `name`, `short` (22 characters max, calendar cells), `kind` (festival | spectacle | concert | kpop | museum | food | culture | military | aviation | sport | other), `city`, `country` (NL | BE | DE | LU | FR), `region`, `lat`, `lng`, `driveMin` (from Hoensbroek, 180 max unless `tierException: true`, then 300), `start`, `end` (YYYY-MM-DD), `tier` (1 world-renowned or once-a-year must-see, 2 major regional, 3 solid local), `for` (array of `anne` | `alma` | `nick` | `family`), `confidence` (`confirmed` only from an official source for this edition, otherwise `projected`), `source` (URL), `addedOn`, `status` (announced | onsale | soldout | cancelled | tbd).
- **Planning:** `annual`, `onSale`, `sellOutRisk` (low | medium | high | null), `planBy` (set by the updater: high risk = the `onSale` date, medium = `onSale` + 7 days, low = `start` minus 14 days; never after `start`; null when it would be in the past), `ticketUrl`, `priceFrom` (EUR number or null), `ticketNote`.
- **Detail:** `days` (explicit dates when not open every day; `start` and `end` must equal its first and last), `times`, `venue`, `highlights`, `tip`, `parking`, `train`, `lez`, `tags[]`, `verifiedOn`, `dateNote`, `why` (one sentence: why this is worth the drive for this family), `changedOn` + `prevStatus` (set when the updater flips `status`; they drive the Changed list in the New tab), `tierException` + `driveNote` (tier 1 entries between 180 and 300 minutes).

### `data/concerts.json` (array)

`id`, `artist`, `short`, `venueId` (from venues.json, or null with `venueName`, `city`, `country`, `lat`, `lng`, `driveMin`), `date`, `doors` (HH:MM or null), `genre` (kpop | pop | rock | hiphop | electronic | classical | other), `for[]`, `status`, `onSale`, `sellOutRisk`, `planBy`, `ticketUrl`, `priceFrom`, `confidence`, `source`, `addedOn`, `tour`, `note`. Optional `tier`; without it the app derives tier from sell-out risk (high 1, medium 2, else 3).

### `data/venues.json` (array)

`id`, `name`, `city`, `country`, `lat`, `lng`, `driveMin`, `capacity`, `parking`, `train`, `lez`, `listingsUrl` (the venue's own agenda page, the first fetch target of the weekly refresh).

## Scoring and organization (in the browser, never stored)

Score = tier points (60 / 35 / 15) + proximity (max 25, linear to 180 min; concerts to 300) + profile match (10 per selected person in `for`, scaled by the weight sliders, max 20) + urgency (10 if `planBy` within 14 days, 5 within 30) + novelty (5 if `addedOn` within 14 days) + season fit (5 if `annual` and the event month is the current month) + likes (2 per liked lane or tag, max 10). Penalties: sold out -15, cancelled -100 (shown only under Changed), hidden -30. Every list uses lane (five fixed kind groups with fixed colors) then time bucket (this weekend, next weekend, this month, next 3 months, later) then rank. Weekends run Friday to Sunday. Picks on Home show their reasons.

Nearby means `driveMin` of 30 or less (Parkstad, Maastricht, Sittard, Valkenburg, Aachen): cards show a "Nearby" tag and a persisted "Nearby only" toggle (`out-near`) filters Home, Browse, Calendar and Map.

Browser storage keys all start with `out-` (`out-near`, `out-plan`, `out-notes`, `out-hidden`, `out-likes`, `out-weights`, `out-profiles`, `out-lastSeen`, `out-seen`, `out-showHidden`, `out-drive`, `out-sort`, `out-newCount`). The service worker cache prefix is `out-`.

## Rules for editing data

- Never invent facts. Use null when unknown. Official sources only (organizer, venue, city, official tourism board, official ticketing partner); aggregators are leads only.
- Only set `confidence: "confirmed"` from an official source for this edition. Never downgrade a `confirmed` entry to `projected` because a page failed to load.
- A cancelled entry gets `status: "cancelled"`, `changedOn` and `prevStatus`, stays 30 days so it appears under Changed, then is removed.
- Keep `id`s stable forever: saved plans and notes reference them.
- Edit JSON with a small Node script, not by hand. Run `node scripts/build.mjs` after every edit; it must pass before you commit. Never weaken the validator.
- Log every shortcut or unverified item in `BACKLOG.md`.

## Rules for code changes

- Mobile-first at 390 px. Nothing scrolls sideways except the Act now strip. Tap targets 44 px or larger. Layout must work with the keyboard open on the search field.
- Desktop at 900 px and wider: the tab bar is a left rail, Browse and Calendar show the detail beside the list, the calendar shows two months, the map takes the full height. Escape closes the detail panel; arrow keys move through the calendar.
- Keep working features intact: hash routing (`#home`, `#new`, `#calendar`, `#browse`, `#map`, `#plan`, `#e-<id>`, `#c-<id>`), the `store` wrapper and `out-` keys, PDF and ICS export, JSON export/import, offline shell, home-screen install.
- Dark theme only; body text at 7:1 or better. Display face Bricolage Grotesque, body IBM Plex Sans. One warm accent `--urgent`, one cool accent `--new`, one hue per person for dots and chips only, one fixed color per lane. The New badge pulses once on load when the count rose; nothing else animates.
- UI copy: plain English, active voice, no em dashes inside sentences, DD Mon YYYY dates, 24-hour clock, no emoji, no official-looking markers.
- Commits end with the attribution lines Claude Code provides.

Artifact URL: https://claude.ai/artifact/MwmFC7k4pnbxmz8YgtCswb (published 4 Nov 2026 from dist/artifact.html with the `downloads` capability)
