/**
 * Storage for fares riders say they paid.
 *
 * WHY REPORTS ARE NEVER A FARE
 *
 * A rider telling us "I paid 35 taka on the 7 number bus" is one claim. It might
 * be the wrong bus, the wrong direction, last year's price, a cash discount, or
 * an overcharge. Publishing a single claim as "the fare" would be worse than
 * publishing nothing, because people budget around a number they believe.
 *
 * So reports are stored, counted and shown apart from any official figure, with
 * the number of reports visible. They never overwrite a fare, and they never
 * silently become one. Turning a report into a fare is a human decision made by
 * transcribing BRTA's chart, not by this file.
 *
 * Storage is a JSON file rather than a database because the project has no
 * database and the volume is small. This is the one module that would need
 * replacing if the site grew: everything else is static.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CommunityFare, CommunityFareSummary } from '@/types/transit';
import { summariseCommunityFares } from '@/Utils/transit';

const DATA_DIR = path.join(process.cwd(), 'data', 'collected');
const FILE = path.join(DATA_DIR, 'fare-reports.json');

/** A hard ceiling so a spam run cannot fill the disk. */
const MAX_REPORTS = 5000;

/** Plausible ceiling. Anything above this is a typo or an attempt at noise. */
const MAX_SANE_TAKA = 5000;

function readAll(): CommunityFare[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(parsed?.reports) ? parsed.reports : [];
  } catch {
    // Missing or corrupt file means "no reports yet", not a crash. A rider must
    // be able to load the page when this file has never been written.
    return [];
  }
}

function writeAll(reports: CommunityFare[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ reports }, null, 2) + '\n');
}

/** A key that groups reports by the exact trip, so Paltan->Airport is not mixed
 *  with Airport->Paltan. Direction genuinely changes the price. */
export function tripKey(busId: string, fromStopId: string, toStopId: string): string {
  return `${busId}:${fromStopId}:${toStopId}`;
}

export function getReports(busId: string, fromStopId: string, toStopId: string): CommunityFare[] {
  const key = tripKey(busId, fromStopId, toStopId);
  return readAll()
    .filter((r) => tripKey(r.busId, r.fromStopId, r.toStopId) === key)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}

export function getSummary(
  busId: string,
  fromStopId: string,
  toStopId: string
): CommunityFareSummary | null {
  const reports = getReports(busId, fromStopId, toStopId);
  const summary = summariseCommunityFares(reports.map((r) => r.taka));
  if (!summary) return null;
  return { ...summary, mostRecent: reports[0]?.reportedAt ?? null };
}

export type SubmitResult =
  | { ok: true; report: CommunityFare; summary: CommunityFareSummary | null }
  | { ok: false; error: string; field?: string };

/**
 * Add one report, after checking it is worth storing.
 *
 * `knownStopIds` and `knownBusIds` are passed in rather than imported so this
 * module stays testable and does not pull the whole dataset into a route
 * handler just to validate two strings.
 */
export function submitReport(input: {
  busId: unknown;
  fromStopId: unknown;
  toStopId: unknown;
  taka: unknown;
  source: unknown;
  sourceUrl?: unknown;
  note?: unknown;
  knownBusIds: Set<string>;
  knownStopIds: Set<string>;
}): SubmitResult {
  const busId = str(input.busId);
  const fromStopId = str(input.fromStopId);
  const toStopId = str(input.toStopId);
  const source = str(input.source);
  const sourceUrl = str(input.sourceUrl);
  const note = str(input.note).slice(0, 500);

  if (!busId) return { ok: false, error: 'Which bus?', field: 'busId' };
  if (!input.knownBusIds.has(busId)) return { ok: false, error: 'Unknown bus.', field: 'busId' };
  if (!fromStopId || !toStopId) return { ok: false, error: 'Both stops are needed.', field: 'fromStopId' };
  if (fromStopId === toStopId) return { ok: false, error: 'Pick two different stops.', field: 'toStopId' };
  if (!input.knownStopIds.has(fromStopId)) return { ok: false, error: 'Unknown start stop.', field: 'fromStopId' };
  if (!input.knownStopIds.has(toStopId)) return { ok: false, error: 'Unknown destination.', field: 'toStopId' };

  const taka = Number(input.taka);
  if (!Number.isFinite(taka) || taka <= 0) {
    return { ok: false, error: 'Enter the fare in taka.', field: 'taka' };
  }
  if (!Number.isInteger(taka) || taka > MAX_SANE_TAKA) {
    return { ok: false, error: `That does not look like a fare (1-${MAX_SANE_TAKA}).`, field: 'taka' };
  }

  if (!['rider', 'news', 'social'].includes(source)) {
    return { ok: false, error: 'Unknown source.', field: 'source' };
  }
  // A claim lifted from a news article or a social post has to be checkable. A
  // bare number attributed to "the internet" is not evidence of anything.
  if ((source === 'news' || source === 'social') && !/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, error: 'A link to the report is required.', field: 'sourceUrl' };
  }

  const all = readAll();
  if (all.length >= MAX_REPORTS) {
    return { ok: false, error: 'Too many reports stored. Contact the site owner.' };
  }

  const report: CommunityFare = {
    busId,
    fromStopId,
    toStopId,
    taka,
    source: source as CommunityFare['source'],
    sourceUrl: sourceUrl || null,
    reportedAt: new Date().toISOString(),
    note,
  };

  writeAll([...all, report]);
  return { ok: true, report, summary: getSummary(busId, fromStopId, toStopId) };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
