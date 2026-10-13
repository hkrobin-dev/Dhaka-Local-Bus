/**
 * POST /api/fares/promote — accept a rider-agreed fare into fares.json.
 *
 * This is the only endpoint that writes a fare, and it is the whole answer to
 * "how does a fare get set". It requires the shared FARE_ADMIN_TOKEN, and it
 * records where the number came from so the UI can keep saying "rider-reported"
 * rather than implying the government published it.
 *
 * What this endpoint does NOT do, and why that is not a hole: the review page
 * hides the accept button for a group only one person has reported, because one
 * memory is a rumour. That is a guardrail for the maintainer, not a security
 * boundary. The `reportCount` here arrives from the request body, so this
 * endpoint cannot verify it and does not pretend to. The real boundary is the
 * admin token: whoever holds it is by definition the person trusted to publish a
 * fare, and a maintainer is free to accept a single report if they personally
 * know it to be right.
 *
 * The caller must then run `npm run data:build`. That is deliberate: the file
 * on disk is the source of truth, and a deployable build only ever reflects a
 * dataset that was deliberately regenerated.
 */

import { NextResponse } from 'next/server';
import { allBuses } from '@/Utils/transit';
import { promoteFare, revokeFare } from '@/Services/fareOverrides';
import { verifyFareAdmin } from '@/Services/fareAuth';

const knownBusIds = new Set(allBuses().map((b) => b.id));

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  // Checked before anything else, so a bad token reveals nothing about the
  // state of the fare file.
  //
  // Trimmed first. A token is a 64-character random string, so it is always
  // copied rather than typed, and a paste very often brings a trailing space or
  // newline. Without the trim, the honest token is rejected and the error says
  // the secret is wrong, which sends the maintainer off changing a token that
  // was correct all along.
  const token = typeof body.token === 'string' ? body.token.trim() : null;
  if (!verifyFareAdmin(token)) {
    return NextResponse.json({ error: 'Wrong or missing admin token.' }, { status: 403 });
  }

  if (body.action === 'revoke') {
    const result = revokeFare(String(body.busId ?? ''), knownBusIds);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, revoked: body.busId });
  }

  const result = promoteFare(
    {
      busId: typeof body.busId === 'string' ? body.busId : '',
      amount: Number(body.amount),
      source: body.source === 'brta' ? 'brta' : 'community',
      verifiedAt: typeof body.verifiedAt === 'string' ? body.verifiedAt : '',
      reportCount: Number(body.reportCount) || undefined,
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
      note: typeof body.note === 'string' ? body.note : undefined,
    },
    knownBusIds
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    fare: result.fare,
    replaced: result.replaced,
    next: 'Run `npm run data:build` to apply it to the generated dataset.',
  });}
