/**
 * Audits data/source/stop-coordinates.json and drops the matches that are wrong.
 *
 * WHY THIS IS SEPARATE FROM THE FETCHER
 *
 * fetch-coordinates.mjs answers "does OSM know a place with this name in greater
 * Dhaka". That is necessary and it is not sufficient. Nominatim will match a
 * name loosely and happily return a DIFFERENT place of a similar name:
 *
 *   "Airport"        -> Azampur        (not Hazrat Shahjalal International)
 *   "High Court"     -> Lakshmibazar   (not the High Court area)
 *   "Technical"      -> Gabtali        (not BUET, which is what riders mean)
 *
 * Each of those would put a pin in the wrong part of the city, which is worse
 * than showing no pin at all: a rider would walk to the wrong end of the route
 * and trust us. So this script re-queries each accepted stop asking for the
 * English name of the match (name:en), and rejects any where our stop name and
 * OSM's name do not agree.
 *
 * It rewrites the file in place, keeping only the pins that survive, and writes
 * everything it refused to rejected[] for a human to look at.
 *
 *   node scripts/audit-coordinates.mjs
 *   node scripts/audit-coordinates.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

const RATE_LIMIT_MS = 1100;
const USER_AGENT =
  'dhaka-local-bus-finder/0.1 (open-data project; contact: local repo owner)';
const DRY = process.argv.includes('--dry-run');

const FILE = p('data/source/stop-coordinates.json');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DHAKA = { minLat: 23.45, maxLat: 23.95, minLon: 90.2, maxLon: 90.6 };
const inDhaka = (la, lo) =>
  la >= DHAKA.minLat && la <= DHAKA.maxLat && lo >= DHAKA.minLon && lo <= DHAKA.maxLon;

/**
 * Reduce a name to comparable letters.
 *
 * Bangla is stripped entirely rather than transliterated: OSM's local name for
 * "মতিঝিল" is the same place as our "Motijheel", so stripping Bangla would throw
 * away the one signal that agrees. We compare the Latin parts only, and fall
 * back to the numeric part ("Mirpur 10") which survives in both scripts.
 */
function tokens(s) {
  const latin = (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = latin.split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  const digits = (s || '').match(/\d+/g) || [];
  return [...words, ...digits];
}

const STOP = new Set([
  'the', 'and', 'road', 'mor', 'moor', 'more', 'para', 'bazar', 'bazar',
  'gate', 'ghat', 'stand', 'stop', 'bus', 'rail', 'station', 'cross',
  'bridge', 'link', 'new', 'old', 'hat', 'nagar', 'pur', 'of', 'in',
]);

/** "mirpur 10" vs [mirpur, 10] => matches. */
function namesAgree(query, names) {
  const q = new Set(tokens(query));
  if (q.size === 0) return false;
  const other = new Set(names.flatMap(tokens));
  let shared = 0;
  for (const t of q) if (other.has(t)) shared++;
  // Every number must agree, because Mirpur 1 and Mirpur 10 are not close.
  const qDigits = (query.match(/\d+/g) || []).sort();
  const oDigits = names.flatMap((n) => n.match(/\d+/g) || []).sort();
  if (qDigits.length && JSON.stringify(qDigits) !== JSON.stringify([...new Set(oDigits)].sort())) {
    return false;
  }
  return shared / q.size >= 0.5;
}

async function fetchEnglish(coords) {
  const url =
    'https://nominatim.openstreetmap.org/reverse' +
    `?lat=${coords[0]}&lon=${coords[1]}` +
    '&format=json&namedetails=1&zoom=18';
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`reverse ${res.status}`);
  const j = await res.json();
  const nd = j.namedetails || {};
  return [nd['name:en'], j.name, j.display_name].filter(Boolean);
}

async function main() {
  const file = readJson(FILE);
  const ids = Object.keys(file.coordinates || {});
  console.log(`Auditing ${ids.length} coordinates against OpenStreetMap\n`);

  const kept = {};
  const keptMatched = [];
  const dropped = [];

  for (const id of ids) {
    const coords = file.coordinates[id];
    const prior = file.matched.find((m) => m.id === id);
    const query = prior?.queried ?? id;

    let names;
    try {
      await sleep(RATE_LIMIT_MS);
      names = await fetchEnglish(coords);
    } catch (err) {
      dropped.push({ id, name: query, reason: 'lookup-failed', detail: String(err.message) });
      process.stdout.write('?');
      continue;
    }

    const [la, lo] = coords;
    if (!inDhaka(la, lo)) {
      dropped.push({ id, name: query, reason: 'outside-dhaka', detail: names[0] || '' });
      process.stdout.write('x');
      continue;
    }

    if (!namesAgree(query, names)) {
      // This is the "Airport" -> Azampur case. Named explicitly because the
      // whole point of this script is that it catches those.
      dropped.push({
        id,
        name: query,
        reason: 'name-mismatch',
        detail: `OSM calls it ${names.slice(0, 2).join(' / ').slice(0, 80)}`,
      });
      process.stdout.write('x');
      continue;
    }

    kept[id] = coords;
    keptMatched.push({ ...prior, id, queried: query, osm: names[1] || names[0] });
    process.stdout.write('.');
  }

  const pct = Math.round((Object.keys(kept).length / ids.length) * 100);
  console.log(`\n\n  kept     ${Object.keys(kept).length} / ${ids.length}`);
  console.log(`  dropped  ${dropped.length}`);
  console.log(`  precision of this file: ${pct}% of geocoder hits were correct\n`);

  if (!DRY) {
    file.coordinates = kept;
    file.matched = keptMatched;
    file.rejected = [...(file.rejected || []), ...dropped];
    file.auditedAt = new Date().toISOString();
    file.auditNote =
      'Every coordinate here was name-checked against OpenStreetMap and only ' +
      'kept when the names agree. Stops whose pin OSM attributes to a ' +
      'different place were removed rather than shown in the wrong part of ' +
      'the city.';
    fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + '\n');
    console.log('Wrote data/source/stop-coordinates.json');
    console.log('Now run: npm run data:build');
  }

  if (dropped.length) {
    console.log('\nDropped, and why. Each is a stop the map will NOT show:');
    for (const d of dropped) {
      console.log(`  ${d.id.padEnd(26)} ${d.reason.padEnd(14)} ${String(d.detail).slice(0, 60)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});