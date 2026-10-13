/**
 * One-time fetcher for stop coordinates.
 *
 * WHY THIS EXISTS
 *
 * A map needs a latitude and longitude for every stop. We had none: the bus
 * dataset is a hand-typed list of names, and the distance table is bare metres
 * with no positions attached. Without this, no real map of Dhaka can be drawn at
 * all, which is why the route diagram was a schematic.
 *
 * This script is NOT part of `npm run build`. It runs once, against the network,
 * and writes data/source/stop-coordinates.json, which is committed. That is the
 * same rule fetch-distances.mjs follows: a build must never depend on an
 * upstream API being reachable, which is the failure mode that already killed
 * busroutebd.com.
 *
 *   node scripts/fetch-coordinates.mjs
 *   node scripts/fetch-coordinates.mjs --only=paltan,banani     # retry a few
 *
 * WHY THE MATCHING IS DELIBERATELY CAUTIOUS
 *
 * Nominatim will happily return a same-named place in another district, or in
 * another country, and a wrong pin on a bus map is worse than no pin: a rider
 * who trusts it walks to the wrong end of the route. So a hit is only accepted
 * when it lands inside the greater Dhaka bounding box. Everything rejected is
 * written to `rejected` in the output file rather than dropped silently, so a
 * human can go and look at what was refused.
 *
 * Stop names are also messy, so each stop is tried under its display name and
 * under every alias we collected, and the first hit inside the box wins.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

/**
 * Greater Dhaka, generously bounded.
 *
 * lat 23.45-23.95, lon 90.20-90.60. This covers Uttara in the north, Savar-side
 * edges in the west, and Narayanganj in the south-east. It is a sanity box, not
 * a boundary of the city: it exists to reject Chittagong or Kolkata, not to
 * adjudicate which Dhaka suburb a stop is in.
 */
const DHAKA = { minLat: 23.45, maxLat: 23.95, minLon: 90.2, maxLon: 90.6 };

/**
 * Nominatim's usage policy asks for at most one request per second and requires
 * an identifying User-Agent. Both are honoured here rather than parallelised,
 * because a burst of requests from a project this small is how an IP gets
 * blocked and the data becomes unreproducible.
 */
const RATE_LIMIT_MS = 1100;
const USER_AGENT =
  'dhaka-local-bus-finder/0.1 (open-data project; contact: local repo owner)';

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inDhaka(lat, lon) {
  return (
    lat >= DHAKA.minLat && lat <= DHAKA.maxLat &&
    lon >= DHAKA.minLon && lon <= DHAKA.maxLon
  );
}

/** Nominatim's address parts, to record something a human can check later. */
function describe(candidate) {
  const a = candidate.address || {};
  return [a.suburb, a.city_district, a.city, a.county].filter(Boolean).join(', ');
}

async function geocode(query) {
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?q=${encodeURIComponent(query)}` +
    '&format=json&limit=5&addressdetails=1&countrycodes=bd';

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim ${res.status} for "${query}"`);
  return res.json();
}

async function main() {
  const { stops } = readJson(p('src/data/generated/stops.json'));
  const targets = ONLY ? stops.filter((s) => ONLY.has(s.id)) : stops;

  console.log(`Geocoding ${targets.length} stops via Nominatim`);
  console.log(`  one request per ${RATE_LIMIT_MS}ms, roughly ${Math.ceil((targets.length * RATE_LIMIT_MS) / 60000)} min\n`);

  const coordinates = {};
  const rejected = [];
  const matched = [];

  for (const stop of targets) {
    // Try the display name first, then every alias. Stop names are hand-typed,
    // so "Kuril Bishwa Road" and "Kuril Bissho Road" are the same place and one
    // of the two usually matches better than the other.
    const candidates = [stop.nameEn, ...(stop.aliases || [])].filter(Boolean);

    let hit = null;
    let usedQuery = null;
    let sawOutside = null;

    for (const name of candidates) {
      await sleep(RATE_LIMIT_MS);
      let results;
      try {
        results = await geocode(`${name}, Dhaka, Bangladesh`);
      } catch (err) {
        rejected.push({ id: stop.id, name, reason: 'request-failed', detail: String(err.message) });
        break;
      }

      const inside = results.filter((r) => inDhaka(Number(r.lat), Number(r.lon)));
      if (inside.length > 0) {
        hit = inside[0];
        usedQuery = name;
        break;
      }
      // Remember the first out-of-area hit, so the rejection is explainable.
      if (!sawOutside && results.length > 0) sawOutside = results[0];
    }

    if (hit) {
      coordinates[stop.id] = [Number(Number(hit.lat).toFixed(6)), Number(Number(hit.lon).toFixed(6))];
      matched.push({
        id: stop.id,
        queried: usedQuery,
        osm: describe(hit) || hit.display_name,
      });
      process.stdout.write('.');
    } else {
      rejected.push({
        id: stop.id,
        name: stop.nameEn,
        reason: sawOutside ? 'outside-dhaka' : 'no-match',
        detail: sawOutside ? `${sawOutside.display_name?.slice(0, 90)}` : 'no result at all',
      });
      process.stdout.write('x');
    }
  }

  const hits = Object.keys(coordinates).length;
  console.log(`\n\n  resolved ${hits} / ${targets.length}`);
  console.log(`  rejected ${rejected.length}`);

  const output = {
    fetchedAt: new Date().toISOString(),
    source: {
      provider: 'OpenStreetMap Nominatim',
      url: 'https://nominatim.openstreetmap.org',
      note:
        'Geocoded stop NAMES, not surveyed bus stop positions. A match means ' +
        'Nominatim found a place of that name inside greater Dhaka. It does ' +
        'not mean the bus stops at that exact point, and it is not survey ' +
        'grade. Treat it as roughly where, not where exactly.',
    },
    bounds: DHAKA,
    matched,
    rejected,
    coordinates,
  };

  // A --only run must not clobber what a full run already found.
  const target = p('data/source/stop-coordinates.json');
  if (ONLY && fs.existsSync(target)) {
    const existing = readJson(target);
    output.coordinates = { ...(existing.coordinates || {}), ...coordinates };
    output.matched = [...(existing.matched || []), ...matched];
    output.rejected = [...(existing.rejected || [])];
    for (const r of rejected) {
      const at = output.rejected.findIndex((x) => x.id === r.id);
      if (at === -1) output.rejected.push(r);
    }
    console.log(`\n  merged into the existing file: ${Object.keys(output.coordinates).length} stops total`);
  }

  fs.mkdirSync(p('data/source'), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(output, null, 2) + '\n');

  console.log('\nNow run: npm run data:build');
  if (rejected.length) {
    console.log('\nStops with no coordinate. These stay off the map, and the UI falls');
    console.log('back to the schematic route for any journey touching them:');
    for (const r of rejected.slice(0, 25)) console.log(`  ${r.id.padEnd(28)} ${r.reason}`);
    if (rejected.length > 25) console.log(`  ...and ${rejected.length - 25} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});