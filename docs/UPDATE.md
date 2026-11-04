# Weekly data refresh

Runs every Wednesday at 02:30 Europe/Amsterdam as a Claude Code scheduled task. It adds new shows and events, confirms what is coming up, flips statuses, and redeploys. Budget: about 25 web searches and 80 page fetches. Prefer fetching the `source` URL and the venue's own agenda over searching. Never invent dates. Null when unknown.

## 1. Triage
```
node scripts/triage.mjs --days 45 --max 80
```
It prints `soon` (entries starting or going on sale in the next 45 days), `projected` (all), `stale` (not verified in 60 days), `removeExpired`, `removeCancelled` and the `venues` list with every `listingsUrl`.

## 2. Venue sweep
Fetch every `listingsUrl` in `data/venues.json` (22 venues). Some block plain fetches (Beat venues: afas-dome.be, lotto-arena.be, forest-national.be; ING Arena); try their sitemap or the Ticketmaster country page, and say in the report when a venue could not be read. Add:
- every K-pop act regardless of size (genre `kpop`, `for: ["alma"]`, `sellOutRisk: "high"`), including fan events and conventions;
- every stadium show;
- arena shows by major international acts.
Skip tribute acts, comedy, musicals, sport, small-club shows. New concerts get `addedOn` today, a `doors` time if the venue prints one, `onSale` when a sale date is in the future, `priceFrom` only when a regular price is printed, `ticketUrl`, `source` (the venue page), `tour`, `note`.

## 3. Discovery searches
Run at least one search per category (spectacle, festival, K-pop, military, aviation, sport, museum, food, culture) for the next 6 months, with the region focus rotating by week of the year (week number modulo 4): A = NL, B = BE and LU, C = NRW and RLP, D = France (Hauts-de-France, Grand Est) and Hessen. Log the rotation letter in the changelog. Research each lead on its official page; add it only when it clears the bar (would a family in Hoensbroek plan a day or weekend around it?) and sits inside the radius (events 180 min, concerts 300 min; tier 1 events up to 240 min with `tierException: true`). Depth follows proximity: inside 60 min anything that clears the bar, 60 to 120 min major regional events, beyond that tier 1 and 2 only.

## 4. Confirm the triaged entries
For each entry in `soon`, `projected` and `stale`, in that order: fetch `source` (and the organizer site when it differs) and confirm dates, `days`, times, on-sale date, status and price from.
- New official dates: set `start`, `end`, `days`, `confidence: "confirmed"`, `source`, `verifiedOn` today, `status` (`announced`, `onsale`, `soldout`) and `dateNote` ("Dates confirmed on D Mon" or "Dates corrected on D Mon").
- Status flips to `onsale`, `soldout` or `cancelled`: also set `changedOn` today and `prevStatus` to the old value. They appear under Changed in the New tab.
- `planBy`: high sell-out risk = the `onSale` date itself; medium = `onSale` plus 7 days; low = `start` minus 14 days. Never after `start`. Null when it would already be in the past.
- Re-checked with no change: update `verifiedOn` only.
- Never downgrade `confirmed` to `projected` because a page failed to load.
- Cancelled: set `status: "cancelled"` with `changedOn`; keep the entry 30 days, then remove it (`removeCancelled` in triage lists those due). Remove entries in `removeExpired` (ended before today).

## 5. Edit and build
- Edit `data/events.json` and `data/concerts.json` with a short Node script that loads, changes and writes the JSON. Keep `id`s stable. New entries get `addedOn` today and `driveMin: null`, then run `node scripts/drive-times.mjs`.
- Set `data/meta.json` `checked` to today ("11 Nov 2026") and `built` to the ISO date.
```
node scripts/build.mjs
node scripts/build.mjs --artifact
```
Both must pass. If validation fails, fix the data; never weaken the validator.

## 6. Record and publish
1. **Changelog:** add a dated section at the top of `data/CHANGELOG.md`: added (by kind, naming every tier 1 entry and every K-pop, military or aviation entry), status changes (old to new), corrected dates (old to new), removed, rotation run, what could not be verified.
2. **Backlog:** add unverified items and blocked hosts to `BACKLOG.md`.
3. **Git:** commit `data/`, `public/` and the docs with the message `Weekly refresh YYYY-MM-DD` and the attribution lines, then push to `main`. Vercel redeploys automatically. If the push is refused, say so in the report and continue.
4. **claude.ai artifact:** republish the artifact named in `CLAUDE.md` with `dist/artifact.html`. Keep its title and capabilities.
5. **Vercel:** if no project is linked to the repo, create it with `create_git_project` (repo `ndubaz/ToDoNL`, team `team_O5dGajZMxTjDlfCmwOIKjT5w`).

## 7. Report
Send Nick one short message:
- count added, by kind
- every new tier 1 entry
- every new K-pop, military or aviation entry
- status changes to `onsale` or `soldout` for tier 1 and 2 entries
- on-sale dates in the next 14 days
- failures (push, deploy, artifact, unreachable venues)

Facts only, no padding.
