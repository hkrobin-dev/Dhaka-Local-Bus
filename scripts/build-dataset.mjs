/**
 * Builds the canonical dataset from the raw source.
 *
 * Input  : data/source/dhaka-city-local-bus.json   (156 real local buses, scraped 2024)
 *          data/source/stop-distances.json         (real metres between stop pairs)
 *          data/source/stop-coordinates.json       (OPTIONAL, lat/lng per stop;
 *                                                   does not exist yet)
 *          data/source/fare-policy.json            (BRTA's published per-km rate)
 *          data/overrides/stop-aliases.json        (hand-curated stop cleanup)
 *          data/overrides/stop-names-bn.json       (hand-curated Bangla stop names)
 *          data/overrides/fares.json               (hand-transcribed BRTA fares)
 *          data/overrides/dead-images.json         (image URLs that no longer resolve)
 * Output : src/data/generated/stops.json
 *          src/data/generated/buses.json
 *          src/data/generated/distances.json
 *          src/data/generated/fare-policy.json
 *          src/data/generated/review-needed.json
 *
 * COORDINATES
 *
 * There are none. The bus dataset is a hand-typed list of stop names with no
 * positions, and nothing here geocodes, so no geographic map can be drawn from
 * this repo as it stands. The slot is opened anyway so coordinates can be added
 * later without reshaping anything: put them in data/source/stop-coordinates.json
 * keyed by stop id and the UI switches to a real map. Absent file is fine.
 *
 * The whole point of this script is that the raw data is not trustworthy.
 * Stop names are typed by hand by whoever built the source list, so the same
 * place shows up as "Kuril Bishwa Road", "Kuril Bissho Road" and
 * "Kuril  Bishwa Road". If we search the raw strings, a rider who types the
 * correct spelling gets nothing. So we collapse every variant onto one id.
 *
 * Nothing here invents data. A stop we cannot confidently name keeps its raw
 * English name and gets listed in review-needed.json instead.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

/** Where the app reads its data from. The @/* alias points at src/, so the
 *  generated JSON has to live under src/ to be importable by the UI. */
const OUT = p('src/data/generated');

/** Shorthand for a path inside the output directory. */
const out = (name) => path.join(OUT, name);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * Read a file that is allowed to be absent.
 *
 * For data/source/stop-coordinates.json, which does not exist yet. An absent
 * optional input is a normal state rather than a build failure; a malformed
 * one still throws, because that is a real mistake.
 */
function readJsonIfPresent(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
};

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------- load inputs

const raw = readJson(p('data/source/dhaka-city-local-bus.json'));
const distanceSource = readJson(p('data/source/stop-distances.json'));
const farePolicy = readJson(p('data/source/fare-policy.json'));
const aliases = readJson(p('data/overrides/stop-aliases.json'));
const namesBn = readJson(p('data/overrides/stop-names-bn.json'));
const fares = readJson(p('data/overrides/fares.json'));
const deadImages = readJson(p('data/overrides/dead-images.json'));

/*
 * OPTIONAL: data/source/stop-coordinates.json
 *
 * There are no coordinates anywhere in this project today. The bus dataset is a
 * hand-typed list of stop names, the distance table is bare metres, and nothing
 * here geocodes. So a geographic map cannot be drawn from what exists.
 *
 * The slot is opened now anyway, and it behaves exactly like stop-distances.json:
 * a separate one-time script produces the file, the file is committed, and the
 * build stays offline. Absent file means no coordinates and the UI draws the
 * schematic stop-order diagram instead. It is not an error.
 *
 * Expected shape:
 *   { "coordinates": { "paltan": [23.7294, 90.4084], ... } }
 * keyed by OUR canonical stop ids.
 */
const coordinateSource = readJsonIfPresent(p('data/source/stop-coordinates.json'));
const coordinates = coordinateSource?.coordinates || {};

if (!Array.isArray(raw.data)) {
  throw new Error('source file has no data array');
}

const aliasMap = aliases.alias || {};
const compoundMap = aliases.compound || {};
const tolerances = aliases.tolerances || [];

/** Strip the noise that creeps into hand-typed stop names. */
function tidy(rawName) {
  let s = rawName;
  for (const { match, replace } of tolerances) {
    s = s.replace(new RegExp(match, 'g'), replace);
  }
  return s.trim().replace(/\s+/g, ' ');
}

// ------------------------------------------------- decide what each stop maps to

/** Every distinct stop string we have seen, and how many buses mention it. */
const mentions = new Map();
for (const bus of raw.data) {
  for (const stop of bus.routes || []) {
    mentions.set(stop, (mentions.get(stop) || 0) + 1);
  }
}

// A stop id can be produced by three routes: an explicit alias, an explicit
// compound mapping, or by tidying the name and slugging it. Explicit always wins.
function resolveId(rawName) {
  if (aliasMap[rawName]) return { id: aliasMap[rawName], via: 'alias' };
  if (compoundMap[rawName]) return { id: compoundMap[rawName], via: 'compound' };
  return { id: slug(tidy(rawName)), via: 'auto' };
}

// Group raw stop strings onto canonical ids so we can pick the best display name
// and collect every spelling as a searchable alias.
const groups = new Map(); // id -> { rawNames: Map<raw, count>, via }

for (const [rawName, count] of mentions) {
  const { id, via } = resolveId(rawName);
  if (!groups.has(id)) groups.set(id, { rawNames: new Map(), via });
  const g = groups.get(id);
  // An id reached by an explicit mapping should never be downgraded to auto.
  if (via !== 'auto') g.via = via;
  g.rawNames.set(rawName, (g.rawNames.get(rawName) || 0) + count);
}

// ------------------------------------------------------------- build the stops

const warnings = [];
const stops = [];

for (const [id, group] of groups) {
  // Display name = the most frequently typed spelling of this place.
  const ranked = [...group.rawNames.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const displayName = ranked[0][0];

  // Every spelling anyone has ever typed, so search finds all of them.
  const aliasStrings = [...group.rawNames.keys()]
    .map((r) => tidy(r))
    .filter((t) => t && slug(t) !== id);

  const stop = {
    id,
    nameEn: displayName,
    nameBn: namesBn[id] || null,
    aliases: aliasStrings,
    // How many of the 156 buses serve this stop. Useful later for "big hub" UI.
    busCount: [...group.rawNames.values()].reduce((a, b) => a + b, 0),
    // Absent unless data/source/stop-coordinates.json exists. See the load
    // section for why this is optional and what it is for.
    lat: coordinates[id]?.[0] ?? null,
    lng: coordinates[id]?.[1] ?? null,
  };

  if (group.via === 'compound') {
    warnings.push({
      kind: 'compound-stop',
      id,
      detail:
        'Source listed this as two places joined together. Pointed at the first. ' +
        'A human should check the real route.',
      spellings: ranked.map(([r, c]) => `${r} (${c})`),
    });
  }

  // An id merged from several different spellings is worth seeing, so we can
  // confirm the merge was right rather than assume it.
  if (group.rawNames.size > 1) {
    warnings.push({
      kind: 'merged-spellings',
      id,
      detail: `Collapsed ${group.rawNames.size} spellings onto "${displayName}".`,
      spellings: ranked.map(([r, c]) => `${r} (${c})`),
    });
  }

  stops.push(stop);
}

stops.sort((a, b) => b.busCount - a.busCount || a.id.localeCompare(b.id));

// --------------------------------------------------------------- build the buses

const knownStopIds = new Set(stops.map((s) => s.id));
const buses = [];

for (const [index, bus] of raw.data.entries()) {
  const nameEn = tidy(bus.english || `Bus ${index + 1}`);

  // Bus names are unique enough in practice, but guard anyway so two buses
  // can never share an id and silently overwrite each other's fare.
  let id = slug(nameEn);
  if (buses.some((b) => b.id === id)) id = `${id}-${index + 1}`;

  const stopIds = [];
  for (const stopName of bus.routes || []) {
    const { id: stopId } = resolveId(stopName);
    if (!knownStopIds.has(stopId)) {
      throw new Error(
        `Bus "${nameEn}" references stop "${stopName}" which did not produce a stop. ` +
          `This means the alias file points "${stopName}" at id "${stopId}" but no stop ` +
          `with that id was created.`
      );
    }
    // A bus visiting the same stop twice is a data error, not a loop.
    if (stopIds[stopIds.length - 1] !== stopId) stopIds.push(stopId);
  }

  const fare = fares.buses?.[id] || null;

  // Every image in the source pointed at one Firebase bucket that Google has
  // since switched off (see data/overrides/dead-images.json). Emitting the URL
  // anyway would render 156 broken images, so the dead ones are dropped here and
  // the reason is kept for anyone who wonders where the photos went.
  const sourceImage = bus.image || null;
  const imageIsDead = Boolean(sourceImage && deadImages.dead[sourceImage]);

  buses.push({
    id,
    nameEn,
    nameBn: tidy(bus.bangle || '') || null,
    // Route order matters: it is the whole basis of "how many stops between".
    stopIds,
    endpoints: stopIds.length ? [stopIds[0], stopIds[stopIds.length - 1]] : [],
    serviceType: tidy(bus.service_type || '') || null,
    // Only 11 of 156 source buses had any timing at all, and none of it is
    // trustworthy, so we keep the field but never display it.
    sourceTime: tidy(bus.time || '') || null,
    image: imageIsDead ? null : sourceImage,
    imageUnavailable: imageIsDead ? 'source-image-dead' : sourceImage ? null : 'none-in-source',
    fare: fare
      ? { ...fare }
      : null,
  });
}

buses.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

// ------------------------------------------------------ distance between stops

/*
 * BRTA prices city buses per kilometre, so an estimate needs the real distance
 * between two stops. distanceSource.metres is keyed "idA|idB" (sorted, because
 * the road is the same in both directions).
 */
const metres = distanceSource.metres || {};

function segmentMetres(a, b) {
  return metres[a < b ? `${a}|${b}` : `${b}|${a}`] ?? null;
}

// Coverage is measured per route segment, because that is the unit a journey is
// made of. A rider travelling three segments needs all three to be known; a gap
// anywhere would silently understate the distance, and therefore the fare.
for (const bus of buses) {
  let known = 0;
  for (let i = 0; i + 1 < bus.stopIds.length; i++) {
    if (segmentMetres(bus.stopIds[i], bus.stopIds[i + 1]) != null) known++;
  }
  const total = Math.max(0, bus.stopIds.length - 1);
  bus.routeSegments = total;
  bus.routeSegmentsWithDistance = known;
  bus.distanceComplete = total > 0 && known === total;
}

const busesWithCompleteDistance = buses.filter((b) => b.distanceComplete).length;

// "Sitting service" buses are the premium tier. BRTA's published rate is for
// ordinary non-AC buses and plainly does not price them, so no estimate is
// offered for them rather than offering a number that is wrong by design.
const isPremiumService = (bus) => /sitting service/i.test(bus.serviceType || '');
const busesEstimable = buses.filter(
  (b) => b.distanceComplete && !isPremiumService(b)
).length;

/*
 * The number that actually matters is not "is this whole route measured" but
 * "can this specific trip be priced". A journey is a slice of a route, so it
 * only needs the legs between the two stops. Long routes with a gap at one end
 * are still perfectly priceable for most trips.
 *
 * Count every (bus, from, to) pair a rider could actually search for. This is
 * the honest measure of how much of the app can show a fare, and it is the
 * figure worth publishing rather than the per-route one.
 */
let journeysTotal = 0;
let journeysMeasurable = 0;
let journeysEstimable = 0;

for (const bus of buses) {
  const premium = isPremiumService(bus);
  const n = bus.stopIds.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      journeysTotal++;
      let complete = true;
      for (let k = i; k < j; k++) {
        if (segmentMetres(bus.stopIds[k], bus.stopIds[k + 1]) == null) {
          complete = false;
          break;
        }
      }
      if (complete) {
        journeysMeasurable++;
        if (!premium) journeysEstimable++;
      }
    }
  }
}

// ------------------------------------------------------------------- reporting

const untranslated = stops
  .filter((s) => !s.nameBn)
  .map((s) => ({ id: s.id, nameEn: s.nameEn, busCount: s.busCount }))
  .sort((a, b) => b.busCount - a.busCount);

const missingFares = buses
  .filter((b) => !b.fare)
  .map((b) => ({ id: b.id, nameEn: b.nameEn, nameBn: b.nameBn }))
  .sort((a, b) => a.nameEn.localeCompare(b.nameEn));

for (const [id, note] of Object.entries(aliases.suspect || {})) {
  warnings.push({ kind: 'suspect-merge', id, detail: note });
}

/*
 * A coordinate for a stop id that does not exist means the geocoder was run
 * against a different dataset than the one in this repo. Failing loudly is the
 * same rule the alias file already follows: a bad merge is worse than no merge,
 * because a misplaced point on a map is a confident wrong answer.
 */
for (const id of Object.keys(coordinates)) {
  if (!knownStopIds.has(id)) {
    throw new Error(
      `data/source/stop-coordinates.json has a coordinate for stop id "${id}", ` +
        `which is not a stop in the dataset. The coordinates were probably ` +
        `generated from a different build. Fix the ids or delete the file.`
    );
  }
}

const stopsWithCoordinate = stops.filter((s) => s.lat != null && s.lng != null).length;

// A route can only be drawn as a real shape if every stop on it has a position,
// so this is the number worth reporting: not "how many points did we get" but
// "how much of the network could actually be drawn".
let busesFullyPlottable = 0;
for (const bus of buses) {
  if (bus.stopIds.length && bus.stopIds.every((id) => coordinates[id])) {
    busesFullyPlottable++;
  }
}

const review = {
  generatedAt: new Date().toISOString(),
  source: {
    file: 'data/source/dhaka-city-local-bus.json',
    origin: 'https://github.com/imamhossain94/dhaka-city-local-bus-json-data',
    note:
      'Scraped from busroutebd.com, which is now offline. The upstream site is ' +
      'dead, so this file is the only surviving copy we have. It is kept in the ' +
      'repo deliberately: if it is lost the dataset is lost.',
  },
  counts: {
    buses: buses.length,
    stops: stops.length,
    rawStopSpellings: mentions.size,
    spellingsMerged: mentions.size - stops.length,
    stopsWithBanglaName: stops.length - untranslated.length,
    busesWithFare: buses.length - missingFares.length,
    stopsWithDistance: distanceSource.matchedStops,
    distancePairs: Object.keys(metres).length,
    // 0 of 258 until data/source/stop-coordinates.json exists. Reported so the
    // number is visible rather than implied.
    stopsWithCoordinate,
    busesFullyPlottable,
    busesWithCompleteDistance,
    busesEstimable,
    busesPremiumService: buses.filter(isPremiumService).length,
    journeysTotal,
    journeysMeasurable,
    journeysEstimable,
  },
  warnings,
  untranslatedStops: untranslated,
  busesMissingFare: missingFares,
};

writeJson(out('stops.json'), { generatedAt: review.generatedAt, stops });
writeJson(out('buses.json'), { generatedAt: review.generatedAt, buses });
writeJson(out('distances.json'), {
  generatedAt: review.generatedAt,
  fetchedAt: distanceSource.fetchedAt,
  source: distanceSource.source,
  metres,
});
// Copied verbatim so the UI shows the rate, its date and its sources next to
// every estimate, rather than a bare number with no provenance.
writeJson(out('fare-policy.json'), farePolicy);
writeJson(out('review-needed.json'), review);

// ----------------------------------------------------------------- console log

const c = review.counts;
console.log('Dataset built\n');
console.log(`  buses                  ${c.buses}`);
console.log(`  stops                  ${c.stops}`);
console.log(`  raw spellings          ${c.rawStopSpellings}`);
console.log(`  spellings merged away  ${c.spellingsMerged}`);
console.log(`  stops with Bangla name ${c.stopsWithBanglaName} / ${c.stops}`);
console.log(`  stops with distance    ${c.stopsWithDistance} / ${c.stops}`);
console.log(`  distance pairs         ${c.distancePairs}`);
console.log(`  buses fully measured   ${c.busesWithCompleteDistance} / ${c.buses}`);
console.log(`  buses w/ verified fare ${c.busesWithFare} / ${c.buses}`);
console.log(`  stops with coordinates ${c.stopsWithCoordinate} / ${c.stops}`);
console.log(`\n  Possible trips a rider could search: ${c.journeysTotal}`);
console.log(`    with a complete distance         ${c.journeysMeasurable} (${Math.round((c.journeysMeasurable / c.journeysTotal) * 100)}%)`);
console.log(`    of those, fare-estimable         ${c.journeysEstimable} (${Math.round((c.journeysEstimable / c.journeysTotal) * 100)}%)`);
console.log(`\n  Premium "sitting service" buses excluded from estimates: ${c.busesPremiumService}`);
console.log(`  Buses whose whole route is measured: ${c.busesWithCompleteDistance} / ${c.buses}`);
if (c.stopsWithCoordinate === 0) {
  console.log(
    `\n  No coordinates. The route diagram draws stop ORDER, not streets.\n` +
      `  To draw real roads: geocode the stops into\n` +
      `  data/source/stop-coordinates.json as {"coordinates":{"<stopId>":[lat,lng]}},\n` +
      `  then rebuild. Stops with no position stay off the geographic map.`
  );
} else {
  console.log(`  Buses drawable as a real shape: ${c.busesFullyPlottable} / ${c.buses}`);
}
console.log(`\nReview needed: ${untranslated.length} stops need a Bangla name.`);
console.log(`               ${missingFares.length} buses have no verified fare.`);
console.log(`               ${warnings.length} merge warnings logged.`);
console.log(`\nSee src/data/generated/review-needed.json`);
