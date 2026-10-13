/**
 * One-time probe of the bus image URLs in the source data.
 *
 * WHY THIS EXISTS
 *
 * The source dataset points every bus photo at a Firebase Storage bucket
 * belonging to whoever built the original scrape. Those URLs are baked into
 * the committed dataset, so a naive <img src> renders 156 broken images and
 * looks broken on every single result card.
 *
 * Rather than guess, probe them once and record which ones are dead, with the
 * reason. The result is committed so the build is offline and so the reason
 * survives: if someone later asks "why are there no bus photos", the answer is
 * in the repo instead of in a chat log.
 *
 *   node scripts/probe-images.mjs
 *
 * Writes data/overrides/dead-images.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Don't hammer the host; a handful in parallel is plenty for 156 URLs. */
async function probe(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.startsWith('image/')) return { alive: true, status: res.status };
    // Not an image. Read the short error body, it usually explains why.
    let detail = '';
    try {
      const body = await res.text();
      detail = body.slice(0, 300).replace(/\s+/g, ' ');
    } catch {
      /* body already consumed or not readable */
    }
    return { alive: false, status: res.status, detail };
  } catch (err) {
    return { alive: false, status: 0, detail: String(err).slice(0, 200) };
  }
}

async function main() {
  const raw = readJson(p('data/source/dhaka-city-local-bus.json'));
  const buses = raw.data.filter((b) => b.image);
  console.log(`Probing ${buses.length} image URLs...`);

  const dead = {};
  const reasons = new Map();
  let alive = 0;

  const CONCURRENCY = 8;
  for (let i = 0; i < buses.length; i += CONCURRENCY) {
    const batch = buses.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((b) => probe(b.image)));

    batch.forEach((bus, j) => {
      const r = results[j];
      if (r.alive) {
        alive++;
        return;
      }
      dead[bus.image] = {
        bus: bus.english,
        status: r.status,
        reason: r.detail || `HTTP ${r.status}`,
      };
      const key = `${r.status}`;
      reasons.set(key, (reasons.get(key) || 0) + 1);
    });
    process.stdout.write(`\r  checked ${Math.min(i + CONCURRENCY, buses.length)}/${buses.length}`);
  }

  process.stdout.write('\n');
  console.log(`  alive: ${alive}`);
  console.log(`  dead:  ${Object.keys(dead).length}`);
  for (const [status, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`    HTTP ${status}: ${count}`);
  }

  const sample = Object.values(dead)[0];
  if (sample) console.log(`\n  example reason: ${sample.reason}`);

  const output = {
    probedAt: new Date().toISOString(),
    note:
      'Every image in the source dataset pointed at one Firebase Storage bucket. ' +
      'That project was downgraded to the no-cost Spark plan, and Google ' +
      'discontinued default-bucket access for Spark projects, so the whole ' +
      'bucket is permanently gone. These URLs are stripped during the build so ' +
      'the UI does not render 156 broken images. The bus identity (name, number, ' +
      'route) is the real information here anyway.',
    totalProbed: buses.length,
    alive,
    deadCount: Object.keys(dead).length,
    dead,
  };

  fs.writeFileSync(
    p('data/overrides/dead-images.json'),
    JSON.stringify(output, null, 2) + '\n'
  );
  console.log('\nWrote data/overrides/dead-images.json');
  console.log('Now run: npm run data:build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
