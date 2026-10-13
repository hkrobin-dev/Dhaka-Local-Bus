/**
 * A shared secret required to change fares.
 *
 * The fare file is the one place in this project where a wrong number hurts
 * someone with real money, so it must not be writable by an anonymous POST.
 *
 * How the token is set:
 *
 *   .env.local        FARE_ADMIN_TOKEN=<a long random string>
 *
 * If the variable is absent, the promote and revoke endpoints refuse every
 * request, including correct ones. Failing closed is the point: a missing token
 * should mean "nobody can change fares", never "anybody can".
 *
 * The token is compared with timingSafeEqual so an attacker cannot narrow it
 * down one character at a time by measuring response times. That is a low-grade
 * attack against a small project, but it costs three lines to not have it.
 *
 * The token is never sent to the browser. The review page asks for it, keeps it
 * in a form field, and posts it per request.
 */

import { timingSafeEqual } from 'node:crypto';

export function isFareAdminConfigured(): boolean {
  return Boolean(process.env.FARE_ADMIN_TOKEN);
}

/** Constant-time comparison. False if either side is unset or lengths differ. */
export function verifyFareAdmin(provided: string | null | undefined): boolean {
  const expected = process.env.FARE_ADMIN_TOKEN;
  if (!expected || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, and the length of the expected
  // token is not a secret worth protecting, so check it first and return false.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
