# ঢাকা লোকাল বাস · Dhaka Local Bus

Which local bus goes where in Dhaka, and what it costs.

Built for the problem of standing at a terminal and asking twenty people the
same question. Pick two places, get the buses that pass both, in travel order,
with the fare where we have verified it.

## Running it

```bash
npm install
npm run data:build   # regenerate src/data/generated from the source data
npm run dev          # http://localhost:3000
```

Requires Node 20+. There is no database and no API key. `npm run build` runs
the data build first, so a fresh clone cannot deploy with a stale dataset.

## What is real and what is not

This matters more than the feature list, so it is stated plainly.

**Real, and in the repo:**

- 156 local buses, 258 stops, from
  [`dhaka-city-local-bus-json-data`](https://github.com/imamhossain94/dhaka-city-local-bus-json-data).
  Scraped from busroutebd.com in 2024. **That site is now offline**, so
  `data/source/dhaka-city-local-bus.json` is the only surviving copy we know of
  and is committed deliberately.
- Bus names in both Bangla and English.
- Stop aliases, so "Kuril Bissho Road" and "Kuril Bishwa Road" find the same
  place.

**Not real, so not shown:**

- **No transcribed fares.** BRTA also publishes a per-route fare chart, but it is a scanned PDF (116 pages, no text layer). When a person types a bus from it into `data/overrides/fares.json`, that bus gets a real fare shown instead of an estimate. Until then: 0 of 156.
- **No bus photos.** The source had a photo for all 156 buses, every one pointing at a single Firebase bucket that Google switched off. All 156 URLs now return HTTP 402. Rather than render 156 broken images, the UI shows a route-number badge, which is more use at a terminal anyway. `npm run data:probe-images` re-checks them.
- **No pickup points.** Which side of the road to stand on is half the actual difficulty, and we do not have it.
- **No live timings.** Fewer stops between two places is a proxy for a faster ride, not a timetable.
- **No transfers.** Only buses that pass both stops are returned.
- **No road geometry.** Coordinates exist for 188 of 258 stops, so routes that are
  fully located are drawn on a real map of Dhaka. But the line between two pins is
  a straight line, not the road the bus drives, because no road-shape data exists
  anywhere in this project. The map says so on itself.
- **Stop pins are approximate.** They are geocoded place *names*, accurate to the
  neighbourhood, not surveyed bus stops. 28 pins that the audit proved were in the
  wrong part of the city were removed rather than shown. A route whose stops are
  not all located shows the schematic `See the route` diagram instead, which is
  stop order and nothing more.

Run `/data` in the running app to see the current numbers, including how many
stops still need a Bangla name and which merges are still unverified.

## Fares

Dhaka city bus fares are not a price per route. BRTA sets a **rate per
kilometre**: currently ৳2.70/km for ordinary non-AC buses in the metro area, with
a ৳10 minimum, effective 2026-09-21. So a fare can be worked out from the rate
and a real distance.

`data/source/fare-policy.json` holds that rate with its sources. The rate is
verified against three independent outlets (Prothom Alo, The Financial Express,
TBS) rather than trusted from one.

**Three separate things, never merged:**

| | what it is | shown as |
|---|---|---|
| `bus.fare` | a number a human transcribed from BRTA's chart | ৳64, with the date |
| `journey.fare` | official rate × real road distance | "আনুমানিক ৳64" with the arithmetic |
| community reports | what riders say they paid | median + how many people said it |

They are separate types in `src/types/transit.ts` so a bare number can never be
mistaken for a fare. The UI has to say which one it is showing.

**Why the estimate is only an estimate**, and why all of this is on the page
rather than hidden in a tooltip:

- The official rate is frequently not enforced, and overcharging is reported. A
  rider may pay more than the estimate.
- AC and CNG buses are priced outside this rate, and the source data does not say
  which is which often enough to correct for it.
- 40 premium "sitting service" buses are excluded entirely, because the ordinary
  rate plainly does not price them.
- Distances cover 178 of 258 stops. A trip with any unmeasured leg is **not
  priced at all** — a partial distance would produce a cheaper fare, which is
  exactly the kind of confidently wrong number this project exists to avoid.
  18% of all possible trips come out priceable.

### Fares reported by riders

Anyone who actually paid can report it via `POST /api/fares`, from the "Report
fare" button on any result. News and social media claims require a link, so they
can be checked later by a person.

A report is never published as the fare. Reports are grouped by exact bus and
direction, summarised with the **median**, and shown with the number of people
behind them. The median rather than the mean because fares on one route vary by
direction and AC, and a mean of 10, 12 and 30 lands on 17.33 — a number nobody
paid.

Storage is `data/collected/fare-reports.json`, which is gitignored: it is
collected data, not source.

### Who sets a fare, and how

Three tiers, and the tier is the whole point:

| Who | Can do | Cannot do |
| --- | --- | --- |
| Anyone | Report what they paid (`POST /api/fares`) | Change any fare |
| A maintainer, with `FARE_ADMIN_TOKEN` | Accept an agreed report into `fares.json` (`/fares/review`) | Invent a number — the amount is validated |
| The repo owner | Transcribe BRTA's list, commit, deploy | — |

A report becomes a fare by a person choosing it, never automatically. Open
`/fares/review`, enter the admin token, and for each group of reports you can see
the count, the lowest, the median and the highest:

- **Two or more reports agreeing** can be accepted.
- **A single report cannot be accepted** — the button is not rendered. One person
  remembering one price is a rumour, not a fare.
- **Reports that disagree** (spread over 25% of the median) are shown with a
  warning, not blocked, because fares genuinely do vary by direction, AC and
  time.

Accepting writes to `data/overrides/fares.json` and records the provenance. Then
run `npm run data:build`, deliberately: the file on disk is the source of truth,
so a deployed build only ever reflects a dataset someone regenerated on purpose.

A promoted fare is **not** displayed like a BRTA one. It gets a different colour,
the label `রাইডারদের জানানো` and the number of riders behind it, so a
rider-agreed number can never borrow the authority of a published one.

The token is unset by default, and the promote endpoint refuses everything when
it is unset. Copy `.env.example` to `.env.local` and generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. An
unset token means nobody can change fares — never that anybody can.

## Structure

Next.js App Router. The layout follows the structure of the reference project,
with one unavoidable change.

```
data/
  source/            raw scrape, committed because upstream is dead
    dhaka-city-local-bus.json   156 buses, route order
    stop-distances.json         real metres between stop pairs
    fare-policy.json            BRTA's published per-km rate, with sources
    stop-coordinates.json       lat/lng per stop, geocoded and audited.
                                See "A real map, and why it is not the whole
                                answer".
  overrides/         hand-edited corrections (stop aliases, Bangla names, fares)
  collected/         rider fare reports (gitignored, never a published fare)
scripts/
  build-dataset.mjs  the data pipeline, offline
  fetch-distances.mjs  one-time, network, output committed
  fetch-coordinates.mjs  one-time, network, geocodes stop names via OSM
  audit-coordinates.mjs  one-time, network, drops name-mismatched pins
  check-coordinates.mjs  offline, drops pins that contradict real distances
  probe-images.mjs     one-time, network, output committed
src/
  app/               Next.js routing. /, /route/[fromId]/[toId], /data,
                     /fares/review, /api/fares, /api/fares/promote
  Components/        Navbar, SearchForm, StopInput, ResultCard, FareDisplay, ...
  Screens/           page-level components
  Services/          the four modules that write: fareReports, fareOverrides,
                     fareAuth, pendingFares
  Utils/             contexts, and the search + fare logic
  types/             domain types
  data/generated/    build output, imported by the app
```

`src/Pages` from the reference project is `src/Screens` here. Next.js reserves
`src/pages` for the Pages Router, and on Windows `Pages` and `pages` are the
same directory, so the original name breaks the build.

`src/Utils/transit.ts` holds the search and fare logic and the only place the
dataset is read. The UI calls `findJourneys()` and does not know where the data
comes from, so adding a real database later touches one file.

### How search works

The source data is hand-typed, so the same place has many spellings. Searching
the raw strings means a rider who spells it correctly gets nothing. So every
stop gets one canonical id, and every spelling anyone typed becomes an alias:

```
raw:  "Kuril  Bishwa Road" (47)   ─┐
      "Kuril Bissho Road"   (1)   ─┼─> id: kuril-bishwa-road
                                     ┘   nameBn: কুড়িল বিশ্বরোড
```

That collapsed 301 raw spellings to 258 places. Search also folds Bangla digits
to Western, so "মিরপুর ১০" and "Mirpur 10" match.

A bus is a line, not a pair of points, so `findJourneys` checks both directions
along a bus's stop list and returns the one the rider needs.

## Editing the data

Never edit `src/data/generated/` by hand. It is overwritten on every build.

1. `data/overrides/stop-aliases.json` — merge two spellings onto one id.
2. `data/overrides/stop-names-bn.json` — add a Bangla stop name.
3. `data/overrides/fares.json` — add a fare transcribed from BRTA's chart, or
   accept an agreed rider report at `/fares/review` instead of hand-editing.
   Set `source` to `brta` only if you actually read the number off the BRTA list.
4. `npm run data:build`.

The build fails loudly if an alias points at an id that does not exist, and
writes `src/data/generated/review-needed.json` listing untranslated stops,
missing fares, distance coverage, and every merge it made so the guesses can be
checked.

When the official rate changes, update `data/source/fare-policy.json` with its new
sources and effective date, then rebuild. A stale rate is worse than a missing
one, which is why `effectiveFrom` is in the data and shown next to every
estimate.

The two network scripts are not part of `npm run build`. Their output is
committed so a build never depends on an upstream repository staying alive,
which is the failure mode that already killed busroutebd.com.

## A real map, and why it is not the whole answer

There **is** a map now. Every result card with a fully-located route has a
**Map** button that opens a real map of Dhaka, with the stop pins on it and a
bus that travels the route.

Getting one meant producing coordinates, because the source dataset had none.
`scripts/fetch-coordinates.mjs` geocodes all 258 stop names through OpenStreetMap
Nominatim, at one request per second as their usage policy requires. Nominatim
matches names loosely, so **the output had to be audited before it could be
shown**:

```
resolved by the geocoder      216 / 258
dropped by audit-coordinates     0   (network died before it finished)
dropped by check-coordinates    28
usable coordinates             188 / 258   (73%)
```

**The audit was not optional.** Nominatim matched some stop names to entirely
the wrong place:

| Stop name | Geocoded to | Actually |
|---|---|---|
| `Airport` | Azampur | Hazrat Shahjalal International |
| `High Court` | Lakshmibazar | the High Court area |
| `Technical` | Gabtali | BUET |

A wrong pin is worse than no pin, because a rider trusts it and walks to the
wrong end of the route. Three scripts guard the file:

- `fetch-coordinates.mjs` — geocodes, and rejects anything outside a greater
  Dhaka bounding box. Those rejections go to `rejected[]`, never dropped silently.
- `audit-coordinates.mjs` — asks OSM for each pin's **English** name and drops
  any where our stop name and OSM's name disagree. This is the `Airport` check.
  It needs the network.
- `check-coordinates.mjs` — **offline**, and it is the one that did most of the
  work. The repo already holds real road distances between stop pairs, and a road
  can never be shorter than the straight line between its endpoints. So any pair
  whose measured road distance is less than the crow-flight distance is
  geometrically impossible, which proves a pin is in the wrong place. On the
  first run this found **863 impossible pairs** — `gabtoli ↔ mirpur-1: road
  5.78km vs straight 23.43km`. It drops a pin only when it contradicts its
  neighbours repeatedly and by kilometres, since a single bad pair is just
  geocoder noise. **28 pins went.** Afterwards: zero contradictions.

So the map is honest about what it is, and says so on the map itself:

- **Pins are neighbourhood-level.** They are places OSM knows under that name,
  not surveyed bus stops. We do not know where the bus actually halts.
- **The straight line between pins is not the road.** It shows the order the bus
  visits them. There is no road geometry in this project at all, and the map
  prints a warning when the route spans more than a kilometre.
- **A journey needs every stop located** to use the map. One missing pin and the
  whole journey falls back to the schematic `See the route` diagram, because half
  a real map and half an invented one misrepresents the route. With 188 of 258
  stops located, **8 of 156 whole routes** and about **6,000 origin/destination
  pairs** can be mapped.

Even with perfect coordinates this would not be turn-by-turn navigation. It
would still not know which side of the road the bus stops on — see "No pickup
points" above, which is half the actual difficulty at a terminal.

**To refresh the coordinates**, run the three scripts in order:

```bash
node scripts/fetch-coordinates.mjs              # ~5 min, network
node scripts/audit-coordinates.mjs              # ~4 min, network
node scripts/check-coordinates.mjs --prune      # instant, offline
npm run data:build
```

To fix an individual stop, add its pin by hand to
`data/source/stop-coordinates.json` and rebuild. To retry one stop after a bad
geocode, use `node scripts/fetch-coordinates.mjs --only=<stopId>`.

### One decision is waiting

`gulistan` appears in 48 buses, the second most common stop. There is no
neighbourhood called Gulistan in Dhaka, so it is almost certainly a misspelling
of Gulshan. It is **not** auto-merged, because `Gulshan 1`, `Gulshan 2` and
`Gulshan Link Road` already exist separately and we cannot tell which was meant.

It changes results: 43 buses serve Gabtoli, but only 4 list Gulshan 1 while 12
list "Gulistan". So merging likely fixes a lot of missing Uttara-bound results,
and guessing wrong would fabricate a stop. Someone who rides these buses should
decide, then add it to `stop-aliases.json`.
