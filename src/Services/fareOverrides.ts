/**
 * Writing data/overrides/fares.json safely.
 *
 * WHY THIS IS NOT JUST A FILE EDIT
 *
 * fares.json is the one file in this project where a wrong number does real
 * harm: someone budgets a commute around it. So a promoted fare has to carry
 * where it came from, and it has to be impossible to write a malformed entry
 * that silently breaks the build or, worse, ships.
 *
 * Everything here is deliberately conservative:
 *
 *   - Writes are atomic (temp file + rename), so a crash mid-write cannot leave
 *     a truncated fares.json and take the whole site down.
 *   - The bus id must already exist in the generated dataset. A typo would
 *     otherwise create an entry that matches nothing and looks applied.
 *   - The amount is validated as a whole-taka number in a plausible range.
 *   - The JSON comment blocks in the file are preserved, because they are the
 *     instructions for the next person who opens it.
 *
 * This module is the ONLY thing that writes fares.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Fare } from '@/types/transit';

const FARES_FILE = path.join(process.cwd(), 'data', 'overrides', 'fares.json');

/** Matches the ceiling enforced on rider reports, so the two paths agree. */
const MAX_SANE_TAKA = 5000;

export type PromoteInput = {
  busId: string;
  amount: number;
  source: 'brta' | 'community';
  verifiedAt: string;
  /** How many riders agreed, for a community fare. */
  reportCount?: number;
  sourceUrl?: string | null;
  note?: string;
};

export type PromoteResult =
  | { ok: true; fare: Fare; replaced: boolean }
  | { ok: false; error: string };

type FaresFile = Record<string, unknown> & { buses: Record<string, Fare> };

export function readFaresFile(): FaresFile {
  return JSON.parse(fs.readFileSync(FARES_FILE, 'utf8')) as FaresFile;
}

/**
 * Write the file without leaving it half-written.
 *
 * rename() is atomic on the same filesystem, so a reader either sees the old
 * file or the new one, never a half-written one. This matters because the build
 * reads this file and a truncated read would fail the whole build.
 */
function writeAtomic(file: string, data: FaresFile): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/**
 * Add or replace one bus's fare.
 *
 * `knownBusIds` is passed in so this stays a pure-ish function of its inputs
 * and does not pull the whole dataset in just to check one string.
 */
export function promoteFare(
  input: PromoteInput,
  knownBusIds: Set<string>
): PromoteResult {
  if (!input.busId || !knownBusIds.has(input.busId)) {
    return { ok: false, error: 'Unknown bus id. Check the id in /fares/review.' };
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > MAX_SANE_TAKA) {
    return { ok: false, error: `Fare must be a whole number of taka, 1-${MAX_SANE_TAKA}.` };
  }
  if (!['brta', 'community'].includes(input.source)) {
    return { ok: false, error: 'Source must be brta or community.' };
  }
  // A community fare with nobody behind it is just a guess wearing a label.
  if (input.source === 'community' && !input.reportCount) {
    return { ok: false, error: 'A community fare needs at least one rider report.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.verifiedAt)) {
    return { ok: false, error: 'verifiedAt must be YYYY-MM-DD.' };
  }

  const fare: Fare = {
    amount: input.amount,
    verifiedAt: input.verifiedAt,
    source: input.source,
    // Provenance only. These are what let the UI say "3 riders reported this"
    // instead of implying the government published it.
    ...(input.reportCount ? { reportCount: input.reportCount } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.note ? { note: input.note.slice(0, 300) } : {}),
  };

  const file = readFaresFile();
  const replaced = Boolean(file.buses[input.busId]);
  file.buses[input.busId] = fare;
  writeAtomic(FARES_FILE, file);

  return { ok: true, fare, replaced };
}

/** Remove a fare, for when a maintainer decides an entry was wrong. */
export function revokeFare(busId: string, knownBusIds: Set<string>): { ok: boolean; error?: string } {
  if (!knownBusIds.has(busId)) return { ok: false, error: 'Unknown bus id.' };
  const file = readFaresFile();
  if (!file.buses[busId]) return { ok: false, error: 'No fare to revoke for that bus.' };
  delete file.buses[busId];
  writeAtomic(FARES_FILE, file);
  return { ok: true };
}

/** Turn a median into a date string for verifiedAt, defaulting to today. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
