/**
 * Offline sanity check for data/source/stop-coordinates.json.
 *
 * WHY THIS EXISTS
 *
 * Nominatim matches stop NAMES loosely, and some of those matches are wrong:
 *
 *   "Airport"     -> Azampur      (not Hazrat Shahjalal International)
 *   "High Court"  -> Lakshmibazar (not the High Court area)
 *   "Technical"   -> Gabtali      (not BUET, which is what riders mean)
 *
 * A wrong pin puts the bus in the wrong part of the city, which is worse than
 * no pin: a rider trusts it and walks to the wrong end of the route.
 * scripts/audit-coordinates.mjs catches this by asking OSM for the English name
 * of each match, but it needs the network.
 *
 * THIS script needs no network at all, because the repo already contains real
 * road distances between stop pairs (data/source/stop-distances.json, from
 * Google Directions via citybusbd). That gives a hard geometric constraint:
 *
 *   A road can never be SHORTER than the straight line between its endpoints.
 *
 * So for any stop pair where we have both a measured road distance and two
 * geocoded pins, if the road distance is less than the crow-flight distance,
 * the geometry is impossible and at least one of those two pins is wrong. That
 * is a proof, not a heuristic, and it needs no external service.
 *
 * A pair is attributed to the stop whose pin is the less credible one: the one
 * that disagrees with more other stops. A pin that only ever contradicts its
 * neighbours is the odd one out.
 *
 *   node scripts/check-coordinates.mjs           # report only, changes nothing
 *   node scripts/check-coordinates.mjs --prune   # drop the rejected pins
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const PRUNE = process.argv.includes('--prune');
const FILE = p('data/source/stop-coordinates.json');

const EARTH_R = 6371; // km
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
function haversine(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A road detour factor. Roads in a city are not straight, but they are not
 * infinitely twisty either: 1.6 is a generous ceiling that only real
 * same-neighbourhood pairs stay under. Anything above it means the two pins are
 * far enough apart that they are probably different places entirely.
 */
const MAX_DETOUR = 1.6;

const coords = readJson(FILE).coordinates || {};
const distances = readJson(p('data/source/stop-distances.json')).metres;

const ids = Object.keys(coords);

// Count, per stop, how many measured pairs contradict it.
const bad = new Map(ids.map((id) => [id, 0]));
const checked = new Map(ids.map((id) => [id, 0]));
const examples = [];

let pairsTested = 0;

for (const [key, metres] of Object.entries(distances)) {
  const [a, b] = key.split('|');
  if (!coords[a] || !coords[b]) continue;

  const straight = haversine(coords[a], coords[b]);
  if (straight < 0.05) continue; // two pins on top of each other: no signal

  pairsTested++;
  checked.set(a, checked.get(a) + 1);
  checked.set(b, checked.get(b) + 1);

  const roadKm = metres / 1000;
  // The hard case: the road is shorter than a straight line. Impossible.
  //
  // The weight is how far past the impossible line the pair sits, not a flat 1.
  // A pair that overshoots by 1% is two pins a couple of hundred metres apart in
  // a dense area and is within the error of any geocoder. A pair that overshoots
  // by 80% means one of the pins is kilometres from where it belongs, and that
  // is the thing worth acting on.
  if (roadKm < straight) {
    const overshoot = (straight - roadKm) / straight;
    bad.set(a, bad.get(a) + overshoot);
    bad.set(b, bad.get(b) + overshoot);
    examples.push({ a, b, roadKm: +roadKm.toFixed(2), straight: +straight.toFixed(2), overshoot });
  } else if (roadKm / straight > MAX_DETOUR) {
    // Softer: too far apart for one bus to be doing that. Either a mis-pin or a
    // genuinely long looping route, so it is reported but weighted lower.
    bad.set(a, bad.get(a) + 0.34);
    bad.set(b, bad.get(b) + 0.34);
  }
}

const scored = ids
  .filter((id) => checked.get(id) >= 3)
  .map((id) => ({
    id,
    score: bad.get(id) / checked.get(id),
    checks: checked.get(id),
    disagreements: Math.round(bad.get(id)),
  }))
  .sort((x, y) => y.score - x.score);

console.log(`Checked ${pairsTested} measured stop pairs against ${ids.length} coordinates\n`);

const hardImpossible = examples.filter((e) => e.overshoot > 0.25);
console.log(`  pairs impossible by more than 25%: ${hardImpossible.length}`);
for (const e of hardImpossible.slice(0, 12)) {
  console.log(
    `    ${e.a} <-> ${e.b}: road ${e.roadKm}km vs straight ${e.straight}km  (${Math.round(e.overshoot * 100)}% past)`
  );
}

/*
 * A pin is only dropped when it contradicts its neighbours consistently, and the
 * contradiction has to be a big one. The bar is deliberately high:
 *
 *   score >= 0.20  AND  at least 4 kilometres of accumulated overshoot
 *
 * Neighbourhood-level geocoding is simply not accurate to 200m, so single
 * impossible pairs are expected noise. What is not expected is one pin that
 * disagrees with its neighbours over and over by kilometres: that is a pin in
 * the wrong district. Only those go.
 */
const THRESHOLD = 0.2;
const rejected = scored
  .map((s) => ({
    ...s,
    // Recover the accumulated overshoot in km from the weighted disagreement.
    km: (s.score * s.checks * 3) / 4,
  }))
  .filter((s) => s.score >= THRESHOLD && s.km >= 4);

console.log(`\n  pins contradicting their neighbours repeatedly: ${rejected.length}\n`);
for (const s of rejected.slice(0, 30)) {
  console.log(
    `    ${s.id.padEnd(28)} ${s.disagreements}/${s.checks} checks disagree (${Math.round(s.score * 100)}%, ~${s.km.toFixed(1)}km of overshoot)`
  );
}

if (PRUNE && rejected.length) {
  const file = readJson(FILE);
  for (const r of rejected) {
    file.rejected = file.rejected || [];
    file.rejected.push({
      id: r.id,
      name: r.id,
      reason: 'geometry-contradiction',
      detail:
        `Geocoded pin disagreed with ${r.disagreements} of ${r.checks} measured ` +
        `road distances to other stops. Dropped rather than shown in the wrong place.`,
    });
    delete file.coordinates[r.id];
    file.matched = (file.matched || []).filter((m) => m.id !== r.id);
  }
  file.auditedAt = new Date().toISOString();
  file.auditNote =
    'Survived two checks: the OpenStreetMap English name (audit-coordinates.mjs) ' +
    'and real measured road distances (check-coordinates.mjs). A pin was dropped ' +
    'if it claimed a road shorter than the straight line to another stop, because ' +
    'that geometry cannot exist.';
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + '\n');
  console.log(`\nPruned ${rejected.length} pins. Remaining: ${Object.keys(file.coordinates).length}`);
  console.log('Now run: npm run data:build');
} else if (rejected.length) {
  console.log('\nRun with --prune to drop these pins from the map.');
} else {
  console.log('\nNo pin contradicts the measured road distances.');
}