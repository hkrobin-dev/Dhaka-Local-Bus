import fs from 'node:fs';
import path from 'node:path';
import type { CommunityFare } from '@/types/transit';
import { getStop } from '@/Utils/transit';
import { allBuses } from '@/Utils/transit';
import { summariseCommunityFares } from '@/Utils/transit';
import { isFareAdminConfigured } from '@/Services/fareAuth';

const FILE = path.join(process.cwd(), 'data', 'collected', 'fare-reports.json');

/**
 * Rider reports, grouped into something a person can actually judge.
 *
 * This runs on the server and reads the file directly rather than going through
 * the API. The reports are grouped by bus AND direction, because the same bus
 * costs different amounts each way and a merged group would hide that.
 *
 * A group is only surfaced once a second report agrees with the first. A single
 * report is one person's memory, and promoting it would be publishing a guess.
 */
export type PendingGroup = {
  key: string;
  busId: string;
  busNameEn: string;
  busNameBn: string | null;
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
  reports: CommunityFare[];
  summary: NonNullable<ReturnType<typeof summariseCommunityFares>>;
  /** Do the reports actually agree, or is it one claim plus noise? */
  consensus: 'strong' | 'mixed' | 'single';
  /** Sources present, so a maintainer can see if it is one person or many. */
  sources: Array<CommunityFare['source']>;
};

function readReports(): CommunityFare[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(parsed?.reports) ? parsed.reports : [];
  } catch {
    return [];
  }
}

export function getPendingGroups(): PendingGroup[] {
  const busById = new Map(allBuses().map((b) => [b.id, b]));
  const groups = new Map<string, CommunityFare[]>();

  for (const report of readReports()) {
    const key = `${report.busId}:${report.fromStopId}:${report.toStopId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(report);
  }

  const out: PendingGroup[] = [];

  for (const [key, reports] of groups) {
    const bus = busById.get(reports[0].busId);
    if (!bus) continue; // A report for a bus that no longer exists in the data.

    const amounts = reports.map((r) => r.taka);
    const summary = summariseCommunityFares(amounts);
    if (!summary) continue;

    // Agreement check: how tightly clustered are the reports? A spread wider
    // than 25% of the median is not agreement, however many people report it.
    const spread = (summary.highest - summary.lowest) / Math.max(1, summary.medianTaka ?? 1);
    const consensus: PendingGroup['consensus'] =
      reports.length === 1 ? 'single' : spread <= 0.25 ? 'strong' : 'mixed';

    out.push({
      key,
      busId: bus.id,
      busNameEn: bus.nameEn,
      busNameBn: bus.nameBn,
      fromStopId: reports[0].fromStopId,
      toStopId: reports[0].toStopId,
      fromName: getStop(reports[0].fromStopId)?.nameEn ?? reports[0].fromStopId,
      toName: getStop(reports[0].toStopId)?.nameEn ?? reports[0].toStopId,
      reports: reports.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
      summary,
      consensus,
      sources: [...new Set(reports.map((r) => r.source))],
    });
  }

  // Strongest agreement first, so the obviously-decidable ones are at the top.
  return out.sort((a, b) => {
    const rank = { strong: 0, mixed: 1, single: 2 };
    if (rank[a.consensus] !== rank[b.consensus]) return rank[a.consensus] - rank[b.consensus];
    return b.summary.reportCount - a.summary.reportCount;
  });
}

export const adminConfigured = isFareAdminConfigured;
