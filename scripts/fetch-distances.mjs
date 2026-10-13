/**
 * One-time fetcher for stop-to-stop distances.
 *
 * WHY THIS EXISTS
 *
 * BRTA sets Dhaka city bus fares as a rate per kilometre, not as a price per
 * route. To turn that rate into a number a rider cares about, we need the real
 * distance between two stops. The bus dataset we have has no distances at all.
 *
 * We found a distance table in the abandoned `citybusbd` project, which was
 * built from Google Directions distance-matrix data. It is keyed by opaque
 * hashed stop ids, so it is joined to our stops by English name below.
 *
 * This script is NOT part of `npm run build`. It runs once, and its output
 * `data/source/stop-distances.json` is committed to the repo. That is
 * deliberate: the upstream project it reads from is unmaintained and may
 * disappear, exactly like busroutebd.com already did. We keep our own copy.
 *
 *   node scripts/fetch-distances.mjs
 *
 * The output is keyed by OUR stop ids, so build-dataset.mjs can consume it
 * without knowing anything about hashes or the upstream project.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

const UPSTREAM = 'https://raw.githubusercontent.com/thekhairul/citybusbd/main';
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Case/punctuation-insensitive key, so "Kallyanpur" and "Kallyan Pur" align. */
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log('Fetching distance data from citybusbd...');
  const [theirStops, theirDistances] = await Promise.all([
    getJson(`${UPSTREAM}/stops/dhaka.json`),
    getJson(`${UPSTREAM}/distances/dhaka.json`),
  ]);

  const upstreamStops = Array.isArray(theirStops) ? theirStops : Object.values(theirStops);
  console.log(`  upstream stops:     ${upstreamStops.length}`);
  console.log(`  upstream pair rows: ${Object.keys(theirDistances).length}`);

  // Our canonical stops, produced by the main build. Each one carries every
  // spelling anyone has typed, which gives us several chances to match.
  const { stops: ourStops } = readJson(p('src/data/generated/stops.json'));

  const upstreamByName = new Map();
  for (const s of upstreamStops) {
    const key = norm(s.en);
    if (key && !upstreamByName.has(key)) upstreamByName.set(key, s);
  }

  // our stop id -> upstream hashed id
  const ourIdToUpstream = new Map();
  let matchedStops = 0;
  for (const stop of ourStops) {
    for (const candidate of [stop.nameEn, ...(stop.aliases || [])]) {
      const hit = upstreamByName.get(norm(candidate));
      if (hit) {
        ourIdToUpstream.set(stop.id, hit.id);
        matchedStops++;
        break;
      }
    }
  }
  console.log(`  our stops matched:  ${matchedStops} / ${ourStops.length}`);

  // Reverse index, so the pair loop below is O(1) per lookup.
  const upstreamToOur = new Map();
  for (const [ourId, upstreamId] of ourIdToUpstream) {
    upstreamToOur.set(upstreamId, ourId);
  }

  // Keep only the pairs where both ends are stops we actually know, so the
  // committed file stays small and directly usable.
  const pairs = {};
  let dropped = 0;
  for (const [key, metres] of Object.entries(theirDistances)) {
    const [a, b] = key.split(':');
    const ourA = upstreamToOur.get(a);
    const ourB = upstreamToOur.get(b);
    if (!ourA || !ourB) {
      dropped++;
      continue;
    }
    // Undirected: a to b is the same road as b to a.
    const lo = ourA < ourB ? ourA : ourB;
    const hi = ourA < ourB ? ourB : ourA;
    pairs[`${lo}|${hi}`] = metres;
  }
  console.log(`  pairs kept:         ${Object.keys(pairs).length}  (dropped ${dropped})`);

  // A sanity check worth failing on: if the join silently collapsed to almost
  // nothing we would publish empty distance data that looks fine.
  const kept = Object.keys(pairs).length;
  if (kept < 100) {
    throw new Error(
      `Only ${kept} distance pairs resolved. The upstream data or the stop names ` +
        `have probably changed. Refusing to write a near-empty file.`
    );
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    source: {
      repo: 'https://github.com/thekhairul/citybusbd',
      file: 'distances/dhaka.json',
      note:
        'Google Directions distance-matrix data, via the abandoned citybusbd ' +
        'project. This repo is unmaintained and may vanish, so this copy is ' +
        'committed. Distances are metres, straight through-road, not walking.',
    },
    matchedStops,
    totalStops: ourStops.length,
    metres: pairs,
  };

  fs.mkdirSync(p('data/source'), { recursive: true });
  fs.writeFileSync(
    p('data/source/stop-distances.json'),
    JSON.stringify(output, null, 2) + '\n'
  );

  const kb = Math.round(
    fs.statSync(p('data/source/stop-distances.json')).size / 1024
  );
  console.log(`\nWrote data/source/stop-distances.json (${kb} KB)`);
  console.log('Now run: npm run data:build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
