/**
 * POST /api/fares  — a rider reports what they actually paid.
 * GET  /api/fares  — what riders have reported for one exact trip.
 *
 * The GET response includes the official rate and the calculated estimate
 * alongside the community reports, so a client cannot accidentally show one
 * without the others. The three are different kinds of claim and must not be
 * merged into a single "fare" field.
 */

import { NextResponse } from 'next/server';
import { allBuses, allStops, farePolicy } from '@/Utils/transit';
import { getReports, getSummary, submitReport } from '@/Services/fareReports';

const knownBusIds = new Set(allBuses().map((b) => b.id));
const knownStopIds = new Set(allStops().map((s) => s.id));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const busId = url.searchParams.get('busId') ?? '';
  const fromStopId = url.searchParams.get('fromStopId') ?? '';
  const toStopId = url.searchParams.get('toStopId') ?? '';

  if (!busId || !fromStopId || !toStopId) {
    return NextResponse.json(
      { error: 'busId, fromStopId and toStopId are all required.' },
      { status: 400 }
    );
  }
  if (!knownBusIds.has(busId)) {
    return NextResponse.json({ error: 'Unknown bus.' }, { status: 404 });
  }

  return NextResponse.json({
    reports: getReports(busId, fromStopId, toStopId),
    summary: getSummary(busId, fromStopId, toStopId),
    // Sent with every response so a client always has the rate and its date
    // available to label an estimate, without a second request.
    policy: {
      policyId: farePolicy.policyId,
      effectiveFrom: farePolicy.effectiveFrom,
      takaPerKm: farePolicy.rate.cityBus.takaPerKm,
      minimumFareTaka: farePolicy.minimumFareTaka,
      source: farePolicy.sources[0]?.url ?? null,
    },
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const result = submitReport({
    busId: body.busId,
    fromStopId: body.fromStopId,
    toStopId: body.toStopId,
    taka: body.taka,
    source: body.source,
    sourceUrl: body.sourceUrl,
    note: body.note,
    knownBusIds,
    knownStopIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, field: result.field }, { status: 400 });
  }

  return NextResponse.json(
    { report: result.report, summary: result.summary },
    { status: 201 }
  );
}
