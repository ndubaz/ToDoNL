# Backlog

Bugs, shortcuts and unverified items. Fixed in one batch when Nick says "execute the backlog".

## v2
- **Web Push notifications.** Not in v1. Needs a push backend (a small server or edge function holding subscriptions), VAPID keys, and a sender that runs after each weekly refresh. Deployment decision for Nick: Vercel function + a KV store, or keep the ICS calendar route. Until then the New tab badge and the ICS export are the notification paths.
- Cross-device sync of plan and notes (currently per device, JSON export/import only).

## Repo and deployment
- The weekly routine is bound to the build session because a routine made from the session tool carries no repository and cannot push (verified 5 Nov 2026: 403 on push). A routine created in the claude.ai UI with the repo selected would run in a clean session each week; switch when convenient.
- Fixed in 2.0 (4 Nov 2026): every finding of the 1.1 audit except the two noted under Code.
- The app was built in `ndubaz/ToDoNL` (the repo attached to the build session; the session could not create `ndubaz/Rondom`). Rename the repo to Rondom on GitHub if you want the name to match; Vercel follows renames.
- `main` was created from the first build branch `claude/serene-clarke-rx8vgi`. Set `main` as the default branch in GitHub settings if it is not.

## Data: unverified or dropped in the 4 Nov 2026 baseline
- Venue agenda URLs that returned 404, 503 or blocked the fetch from the build session: Johan Cruijff ArenA and Lanxess Arena (homepage only), Mitsubishi Electric Halle (homepage only), AFAS Dome, Lotto Arena, Forest National, ING Arena (block plain fetches; sitemap plus cookie jar worked), PSD Bank Dome, Westfalenhalle and Festhalle (503). Ticketmaster (.nl, .be, .de, .fr), Eventim, Teleticketservice and Fnac Spectacles are unreachable from the session, so `priceFrom` is null for all Belgian concerts and KPOP.FLEX 2027 and KCON Europe 2027 are unverified rather than disproven.
- Venue `parking`, `train` and `lez` notes come from general knowledge, not from the venue pages. Check before relying on them; the LEZ rules in Antwerp, Brussels and Amsterdam change.
- Dropped for radius after OSRM routing (just over 3 h, tier 2): Louvre-Lens exhibitions (185 min), Centre Pompidou-Metz (200 min), Eurosonic Groningen (235), Formula E Zandvoort (195), WorldSBK Assen (220), Kaasmarkt Alkmaar opening (195), KLM Open (190). Tier 1 entries between 180 and 240 min were kept with `tierException`. Ask Nick whether tier 2 should get the same exception.
- Dropped for other reasons: Oerol (370 min), Texel fly-in (275), Ballonfeesten Joure (225), Von der Heydt "Wege in die Moderne" (no end date published), TXT Antwerp 12 Jun 2027 (tour dates only on Soompi, no official source), Luxembourg Fête nationale duplicate (kept the military-tagged entry).
- Projected entries (55 events, 1 concert) need their official page checked when it updates. Notable: Tomorrowland 2027 (tomorrowland.com blocked from the session), Kölner Karneval 2027 route and times, Kattenstoet Ieper 2027, Memorial Day Margraten 2027 (defensie.nl agenda page 404), Nationale Taptoe 2027 (now at Brabanthallen 's-Hertogenbosch, not Ahoy), Tag der Bundeswehr 2027 sites, Dürkheimer Wurstmarkt (site TLS failure), ATEEZ Amsterdam 12 Apr 2027 (venue not confirmed), Sinterklaas intocht Grave (news source only).
- Leads not researched or not resolvable from the session: Musikfest der Bundeswehr Düsseldorf (Sep 2027, tier 2 for Nick; domain blocked), Menin Gate centenary ceremonies July 2027, Tilburgse Kermis (included from tilburg.nl; organizer site has a broken TLS certificate), Oktoberfest Düsseldorf (Schützenplatz Eller; visitduesseldorf pages 404), Kölner Oktoberfest (500), Heroes Dutch Comic Con (blocked), Salon du Chocolat Brussels (525), Zythos beer festival (no 2027 info), Comic Con Brussels, Oldtimer Fly-In Schaffen-Diest, Kleine-Brogel spotters day (usually the Friday before Sanicole), Ursel Avia, Volkel open day, Jets and Props Stavelot, Keep Them Rolling convoys, Wings of Liberation events, Musée Royal de l'Armée, Belgian Defence open days 2027, Landmachtdagen 2027, Luchtmachtdagen 2027 (no edition since 2019), small K-pop club shows listed on nlkpoptours.nl without an official venue page (ONEUS, ARTMS, VERIVERY, NEWBEAT, NTX, EVNNE, oceanfromtheblue).
- Prices null where ticket pages are JavaScript-only: Graspop, Lowlands, Pukkelpop, North Sea Jazz, Rock am Ring, Paaspop, Kölner Lichter, Libramont, several museums (Mauritshuis, Kunsthal, La Boverie, Museum Ludwig) and all Beat-venue concerts.
- The brief's assumptions that turned out wrong and were corrected in the data: Maastricht carnival 2027 is 7 to 9 Feb (not 14 to 16); Sanicole's Sunset Airshow is on the Saturday; Paris Air Show 2027 is 14 to 20 Jun (public days 19 and 20 Jun); the Dutch GP ended with 2026; Marinedagen moved to 2028; Parkpop ended in 2023; World Gymnastics 2027 is in Chengdu, not Rotterdam; Eurovision 2027 is in Burgas.

## Added 4 Nov 2026 (2.0 research)
- Eros Ramazzotti at Forest National 14 Apr 2028 is projected: the Beat venue sites redirect to a login, so the date comes from the tour announcement. Ziggo Dome Amsterdam 2028 date not visible yet (the 2027 leg moved to 2028).
- Laura Pausini Ziggo Dome 24 Nov 2027 is projected (venue agenda is script-rendered, laurapausini.com tour page 404).
- Festival du Film Italien de Villerupt dates come from a Luxembourg listings page (official site returned an empty page).
- Kunstbende Limburg 2027 dropped: kunstbende.nl pages did not load; worth adding when the regional round is announced (usually March, Sittard).
- ESA ESTEC Open Day 2027 dropped for radius (185 min, tier 1 would need `tierException`; ask Nick).
- Sanremo 2027 winners' tour (Paris date in the week of 16 Feb 2027) and Belgian Eurosong 2027 final: re-check in February.
- Not found with dated pages: SCHUNCK Heerlen teen courses (agenda is script-rendered; the programme PDF was not read), Bonnefanten teen workshops, Kunstpalast and Aachen museum holiday courses for 2027, K-pop dance and manga workshops, Bokrijk craft weekend 2027.
- Four Stade de France French rap shows were removed because nobody in the household fits; the validator now refuses an empty `for`.

## Code
- Plan conflicts consider only entries spanning 3 days or fewer; long-running exhibitions never clash.
- Deep links to the Browse filters (kind, country, month) are not in the hash; only tabs and entries are.
- Pinch zoom on the map uses two pointers; trackpad pinch on desktop is not handled (wheel zoom is).
- Follows match by substring on name, venue, city and tags; a short word like "Ro" matches too much. Use names.
