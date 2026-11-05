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
- **Scheduled task:** "Rondom weekly refresh (in-session)" (trigger id `trig_01J7Ymw4HiJeuPgzPtqkYdz7`), every Wednesday 02:30 Europe/Amsterdam. It fires into the build session `session_017vVwDJ2yeAwx9iEmSZQrir`, which holds push access to the repo; a fresh-session routine created from this tool gets no repository and its push is refused with 403. To move the task to a fresh session, create it in the claude.ai routines UI with `ndubaz/ToDoNL` selected as the repository and this environment, then delete the in-session one.

## Data schema

### `data/events.json` (array)

- **Required:** `id` (stable lowercase slug, `<name>-<yyyy>`), `name`, `short` (22 characters max, calendar cells), `kind` (festival | spectacle | concert | kpop | museum | food | culture | military | aviation | sport | other), `city`, `country` (NL | BE | DE | LU | FR), `region`, `lat`, `lng`, `driveMin` (from Hoensbroek, 180 max unless `tierException: true`, then 300), `start`, `end` (YYYY-MM-DD), `tier` (1 world-renowned or once-a-year must-see, 2 major regional, 3 solid local), `for` (array of `anne` | `alma` | `nick` | `family`), `confidence` (`confirmed` only from an official source for this edition, otherwise `projected`), `source` (URL), `addedOn`, `status` (announced | onsale | soldout | cancelled | tbd).
- **Planning:** `annual`, `onSale`, `sellOutRisk` (low | medium | high | null), `planBy` (set by the updater, never by the UI: high risk = the `onSale` date when it is still ahead, otherwise `start` minus 30 days; medium = `onSale` + 7 days when `onSale` is within the last week or ahead, otherwise `start` minus 21 days; low or unknown = `start` minus 14 days; never after `start`; null when the result is already in the past), `ticketUrl`, `priceFrom` (EUR number or null), `ticketNote`.
- **Detail:** `days` (explicit dates when not open every day; `start` and `end` must equal its first and last), `times` (free text) and `startTime` (HH:MM or null; the only field the leave-by calculation reads, and only for single-day or `days`-listed entries), `cityNote` (qualifier that used to sit in `city`), `venue`, `highlights`, `tip`, `parking`, `train`, `lez`, `tags[]`, `verifiedOn`, `dateNote`, `why` (one sentence: why this is worth the drive for this family), `changedOn` + `prevStatus` (set when the updater flips `status`; they drive the Changed list in the New tab), `tierException` + `driveNote` (tier 1 entries between 180 and 300 minutes).

### `data/concerts.json` (array)

`id`, `artist`, `short`, `venueId` (from venues.json, or null with `venueName`, `city`, `country`, `lat`, `lng`, `driveMin`), `date`, `doors` (HH:MM or null), `genre` (kpop | pop | rock | hiphop | electronic | classical | other), `for[]` (non-empty; a show for nobody in the household is not listed), `status`, `onSale`, `sellOutRisk`, `planBy`, `ticketUrl`, `priceFrom`, `confidence`, `source`, `addedOn`, `tour`, `why` (one sentence for the card; `note` is research detail shown only on the detail page and must not use relative time words), `tier` (set by the updater: 1 for K-pop and stadium shows, 2 for high or medium sell-out risk, 3 otherwise; without it the app falls back to 2 or 3), `tags[]` (`italian`, `eurovision` where they apply).

### `data/venues.json` (array)

`id`, `name`, `city`, `country`, `lat`, `lng`, `driveMin`, `capacity`, `parking`, `train`, `lez`, `listingsUrl` (the venue's own agenda page, the first fetch target of the weekly refresh).

## Scoring and organization (in the browser, never stored)

Score = tier points (60 / 35 / 15) + proximity (max 25, linear to 180 min; concerts to 300) + profile match (10 per selected person in `for`, scaled by the weight sliders, max 20) + urgency (10 if `planBy` within 14 days, 5 within 30) + novelty (5 if `addedOn` within 14 days, skipped for any `addedOn` date shared by more than 30% of entries, so a baseline import adds nothing) + season fit (5 if `annual`, same month, and starting within 60 days) + follows (8 if the entry matches a name on a selected person's follow list) + likes (2 per liked lane or tag, max 10). Penalties: sold out -15, cancelled -100 (shown only under Changed), hidden -30. Runs longer than 21 days are `ongoing`: they never count as a weekend entry, never take a calendar pip row, sit in their own Ongoing bucket and section, and export as one reminder. Every list uses lane (five fixed kind groups with fixed colors) then time bucket (this week, this weekend, next weekend, this month, next 3 months, later, ongoing) then rank; Browse shows a flat list when the sort is not Best match. Weekends run Friday to Sunday. Picks on Home exclude sold-out entries and show their reasons.

Nearby means `driveMin` of 30 or less (Parkstad, Maastricht, Sittard, Valkenburg, Aachen): cards show a "Nearby" tag and a persisted "Nearby only" toggle (`out-near`) filters Home, Browse, Calendar and Map.

Follows (`out-follows`, names per person, matched client-side against name, venue and tags), RSVP (`out-rsvp`, Maybe or In per person per entry), the Been diary (`out-diary`: who went, rating, one line) and share links (`#g-<id>--<id>`, read-only, with a Save all button) are all device-local by decision: no backend. Calendar feeds (`public/calendar/anne|alma|nick|family|tier1.ics`) are built from the data for one-time subscription on each phone; that is the alert path.

Browser storage keys all start with `out-` (`out-near`, `out-follows`, `out-rsvp`, `out-diary`, `out-calMode`, `out-only`, `out-plan`, `out-notes`, `out-hidden`, `out-likes`, `out-weights`, `out-profiles`, `out-lastSeen`, `out-seen`, `out-showHidden`, `out-drive`, `out-sort`, `out-newCount`). The service worker cache prefix is `out-`.

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
- Keep working features intact: hash routing (`#home`, `#new`, `#calendar`, `#browse`, `#map`, `#plan`, `#e-<id>`, `#c-<id>`, `#g-<ids>`), the `store` wrapper and `out-` keys, PDF and ICS export, calendar feeds, JSON export/import, offline shell, home-screen install, the data health card and the updated line on Home.
- Sheets stack: closing a detail opened from a day list returns to that list; Back closes a detail; the background is inert while a sheet is open; the calendar keeps a focusable day in every month; map pins are keyboard buttons.
- Dark theme only; body text at 7:1 or better. Display face Bricolage Grotesque, body IBM Plex Sans. One warm accent `--urgent`, one cool accent `--new`, one hue per person for dots and chips only, one fixed color per lane. The New badge pulses once on load when the count rose; nothing else animates.
- UI copy: plain English, active voice, no em dashes inside sentences, DD Mon YYYY dates, 24-hour clock, no emoji, no official-looking markers.
- Commits end with the attribution lines Claude Code provides.

Artifact URL: https://claude.ai/artifact/MwmFC7k4pnbxmz8YgtCswb (published 4 Nov 2026 from dist/artifact.html with the `downloads` capability)
