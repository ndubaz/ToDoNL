# Antwerp sources for the weekly refresh

Antwerp is 80 minutes from Hoensbroek and gets a standing pass in every weekly run (see docs/UPDATE.md). The two arenas (AFAS Dome, Lotto Arena) come from `scripts/venue-feeds.mjs`. The pages below proved readable on 18 Nov 2026.

# Antwerp agenda sources that work for the weekly refresh (checked 2026-11-18)

Plain `curl` with a browser User-Agent works for all of these unless noted. WebFetch often fails on them (403, 503 or redirect loops).

## City and tourism
- https://press.visitantwerpen.be/ : Visit Antwerp press room (Prezly). Seasonal newsletters and the Rubens 450 programme. Append `.json` to any story URL for clean JSON (`title`, `published_at`, `body`).
- https://pers.antwerpen.be/ and https://pers.antwerpen.be/category/cultuur--vrije-tijd : City of Antwerp press room (Prezly, same `.json` trick). Announces the New Year fireworks (late December), Bollekesfeest, Museumnacht, Pride, Winter in Antwerpen.
- https://www.winterinantwerpen.be/nl-BE/Programma-2026 : Winter in Antwerpen programme. Script-built: render with `scripts/venue-browse.mjs`.
- BLOCKED: https://visit.antwerpen.be/ and https://www.antwerpen.be/ return 403 (Akamai) to curl, WebFetch and headless Chromium. Use the two press rooms instead.

## Museums (all list exhibitions with dates in static HTML)
- https://kmska.be/en/overview/exhibitions : KMSKA current, expected and past exhibitions with exact dates; detail pages at /en/<slug>.
- https://www.momu.be/en/exhibitions : MoMu current and upcoming (redirects to the Dutch page; dates as DD.MM.YYYY). Prices on https://www.momu.be/nl/praktische-informatie
- https://www.muhka.be/en/ : M HKA exhibitions and public programme.
- https://fomu.be/en/exhibitions : FOMU "On show" list with start and end dates.
- https://mas.be/en/content/whats-display : MAS current and coming exhibitions.
- https://redstarline.be/en , https://divamuseum.be/nl : current exhibition with dates on the home page.
- https://rubenshuis.be/en/450-years-rubens : Rubenshuis 2027 calendar; also lists city dates (Museum Night, Rubens Market, KMSKA opening weekend).
- https://www.havenwereld.be/ : port experience centre, opening news, prices on /praktische-informatie/.
- https://www.dinonights.be/ : ZOO light festival microsite (changes name each winter; linked from https://www.zooplanckendael.be/nl/ or https://www.zooantwerpen.be/nl/).

## Venues
- https://www.koninginelisabethzaal.be/en/program/?p=1 (to p=4) : Koningin Elisabethzaal full calendar, static HTML, date + title + performers; detail pages give time and ticket link.
- https://www.antwerpexpo.be/en/calendar/ : Antwerp Expo fairs and fan events (about two months ahead only).
- https://www.trixonline.be/en/program : Trix club programme, 5 pages, static.

## Annual events (home page carries the next dates)
- https://baloiseantwerp10miles.be/en/ : 10 Miles dates, prices on /en/register-participants/.
- https://antwerpmarathon.com/en/ : Antwerp Marathon date and registration status.
- https://www.antwerpportepic.be/ : Port Epic dates per race.
- https://www.jazzmiddelheim.eu/nl/ : Jazz Middelheim dates.
- https://sinksenfoor.be/ : Sinksenfoor dates, hours, tram lines.
- https://www.bollekesfeest.be/ : Bollekesfeest dates (2027 not yet posted).
- https://www.museumnacht.be/ : Museumnacht date (still 2026).
- https://www.bierpassieweekend.be/ : Bierpassie Weekend dates and prices.
- https://www.maanrock.be/ : Maanrock Mechelen dates.
- https://liveislive.be/nl/ : Live is Live (still 2026).
- https://www.zva.be/nl/nieuws : Zomer van Antwerpen news (programme usually late May).
- https://sailtraininginternational.org/event/the-tall-ships-races-2027/ : Tall Ships host ports per year (Antwerp is an anchor port every four years; next after July 2026 would be 2030).
- https://www.stampe.be/ : Stampe and Vertongen Museum, fly-in news.
- https://www.mil.be/nl/agenda/ : Belgian Defence agenda. Script-built: render with venue-browse.

## Unreachable from this environment (proxy 502, TLS error or redirect loop)
antwerpenproeft.be, antwerppride.be (antwerppride.eu is now a parked domain), cultuurmarkt.be, borgerrio.be, linkerwoofer.be, fire-is-gold.com, hanswijkprocessie.org, antwerpsymphonyorchestra.be (queue page), operaballet.be (script-built, calendar not readable), visitmechelen.be events (script-built), museumplantinmoretus.be activities (client error).
