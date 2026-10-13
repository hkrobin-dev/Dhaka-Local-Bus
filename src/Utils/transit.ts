/**
 * Dataset access and the search logic.
 *
 * The dataset is small enough to hold in memory: 156 buses, 258 stops. There is
 * no database and no network call at query time. That is deliberate. A rider
 * searching on a budget Android over 3G should get an answer in one round trip,
 * and a static dataset can never be down.
 *
 * For scale (other cities, more routes) this file is the only thing that has to
 * change. The UI talks to findJourneys() and does not know where the data lives.
 */

import stopsFile from '@/data/generated/stops.json';
import busesFile from '@/data/generated/buses.json';
import distancesFile from '@/data/generated/distances.json';
import farePolicyFile from '@/data/generated/fare-policy.json';
import type {
  BusesFile,
  Bus,
  CommunityFareSummary,
  DistancesFile,
  FareEstimate,
  FarePolicy,
  StopsFile,
  Stop,
} from '@/types/transit';

// Re-exported so components can import the domain types from one place.
export type {
  Bus,
  Stop,
  Fare,
  FareEstimate,
  FarePolicy,
  CommunityFareSummary,
} from '@/types/transit';

const { stops } = stopsFile as StopsFile;
const { buses } = busesFile as BusesFile;
const distances = distancesFile as DistancesFile;
export const farePolicy = farePolicyFile as FarePolicy;

const stopById = new Map(stops.map((s) => [s.id, s]));
const busById = new Map(buses.map((b) => [b.id, b]));

export function getStop(id: string): Stop | undefined {
  return stopById.get(id);
}

export function getBus(id: string): Bus | undefined {
  return busById.get(id);
}

export function allStops(): Stop[] {
  return stops;
}

export function allBuses(): Bus[] {
  return buses;
}

// ------------------------------------------------------------------- searching

/**
 * Fold a string down to something comparable: lowercase, Bangla digits to
 * Western, punctuation and spacing removed.
 *
 * Bangla digits matter more than they look. A rider typing "মিরপুর ১০" on a
 * Bangla keyboard and someone else typing "Mirpur 10" on an English one are
 * describing the same bus stop, and search has to treat them the same.
 */
function fold(input: string): string {
  return input
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x9e6))
    .replace(/[ঀ-৿]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Precomputed so we are not folding 258 stops on every keystroke. */
const searchIndex = stops.map((stop) => ({
  stop,
  needles: [stop.nameEn, stop.nameBn ?? '', ...stop.aliases]
    .map(fold)
    .filter(Boolean),
}));

/**
 * Find stops matching a query. Matches on the Bangla name, the display English
 * name, and every known misspelling of it.
 *
 * Prefix matches are ranked above mid-word matches, so typing "kur" surfaces
 * "Kuril Bishwa Road" before "Shewrapara".
 */
export function searchStops(query: string, limit = 12): Stop[] {
  const q = fold(query);
  if (q.length < 1) return [];

  const scored: { stop: Stop; score: number }[] = [];

  for (const entry of searchIndex) {
    let best = 0;
    for (const needle of entry.needles) {
      if (needle === q) best = Math.max(best, 100);
      else if (needle.startsWith(q)) best = Math.max(best, 50);
      else if (needle.includes(q)) best = Math.max(best, 10);
    }
    if (best > 0) {
      // Break ties toward the stop more buses serve, which is usually the one
      // the rider meant.
      scored.push({ stop: entry.stop, score: best + Math.min(entry.stop.busCount, 20) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.stop);
}

// ------------------------------------------------------------------ coordinates

/**
 * Whether the dataset has real positions for the stops.
 *
 * It does not: 0 of 258 stops have coordinates, so nothing here can be drawn on
 * a real map of Dhaka. This exists so the UI can tell the difference between
 * "we drew a schematic because we have no coordinates" and "we drew a real map",
 * and label the difference, rather than showing a schematic and implying it is
 * a map of the streets.
 */
export function hasCoordinates(): boolean {
  return stops.some((s) => s.lat != null && s.lng != null);
}

/** A stop's position, or null when we have never been told where it is. */
export function stopPoint(
  stop: Stop
): { lat: number; lng: number } | null {
  return stop.lat == null || stop.lng == null ? null : { lat: stop.lat, lng: stop.lng };
}

/**
 * True when every stop on this slice of route can be placed on a real map.
 *
 * A partially-plottable journey is never drawn geographically. Half the route
 * on real streets and half of it guessed would be a claim about where the bus
 * goes that we cannot support, so it falls back to the schematic entirely.
 */
export function isJourneyPlottable(stopIds: string[]): boolean {
  return stopIds.every((id) => {
    const stop = stopById.get(id);
    return stop != null && stop.lat != null && stop.lng != null;
  });
}

// -------------------------------------------------------------------- journeys

export type Journey = {
  bus: Bus;
  /** The slice of stopIds between the two stops, in travel order. */
  stopsBetween: string[];
  /** Number of stops between, so roughly how long the ride is. */
  stopCount: number;
  /** Real road distance in metres, or null if any leg is unmeasured. */
  distanceMetres: number | null;
  /**
   * What we can say about the fare for this specific trip.
   *
   * A transcribed BRTA fare wins. Otherwise an estimate, with its assumptions
   * attached. Never both, and never a bare number.
   */
  fare: FareEstimate | null;
};

/**
 * Buses that serve both stops, in the correct direction.
 *
 * A bus is a line, not a pair of points. If a rider wants Paltan to Airport, a
 * bus that runs Airport ... Paltan is the answer, but only travelling backwards
 * along its own route. So we check both directions and return the direction the
 * rider actually needs.
 */
export function findJourneys(fromId: string, toId: string): Journey[] {
  if (fromId === toId) return [];

  const journeys: Journey[] = [];

  for (const bus of buses) {
    let slice: string[] | null = null;
    // A bus is a line, not a pair of points. A bus running Airport ... Paltan
    // answers a Paltan-to-Airport request, but only travelled backwards along
    // its own route, so both directions have to be tried.
    slice = sliceBetween(bus.stopIds, fromId, toId);
    if (!slice) slice = sliceBetween(bus.stopIds, toId, fromId);
    if (!slice) continue;

    const distanceMetres = sumRouteDistance(slice);
    journeys.push({
      bus,
      stopsBetween: slice,
      stopCount: slice.length - 1,
      distanceMetres,
      fare: estimateFare(bus, slice, distanceMetres),
    });
  }

  // Fewest stops between first. That is a decent proxy for the fastest ride, and
  // it is honest: we are not pretending to know live traffic.
  journeys.sort((a, b) => a.stopCount - b.stopCount || a.bus.nameEn.localeCompare(b.bus.nameEn));
  return journeys;
}

/** Stops from a to b inclusive, or null if b does not come after a. */
function sliceBetween(stopIds: string[], a: string, b: string): string[] | null {
  const start = stopIds.indexOf(a);
  if (start === -1) return null;
  const end = stopIds.indexOf(b);
  if (end === -1 || end <= start) return null;
  return stopIds.slice(start, end + 1);
}

// ----------------------------------------------------------------------- fares

/** Road distance in metres between two stops, or null if never measured. */
export function segmentMetres(a: string, b: string): number | null {
  return distances.metres[a < b ? `${a}|${b}` : `${b}|${a}`] ?? null;
}

/**
 * One leg of a journey: the road between two consecutive stops, in travel order.
 *
 * Returned as a list rather than a single total because the diagram has to draw
 * each leg separately, and because a leg with no measured distance is a different
 * thing from a leg of zero metres. It must not be rendered as "0 km".
 */
export type RouteLeg = {
  fromStopId: string;
  toStopId: string;
  /** Real road metres, or null when this leg was never measured. */
  metres: number | null;
};

/** The legs between two stops, in the order the bus travels them. */
export function routeLegs(stopIds: string[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 0; i + 1 < stopIds.length; i++) {
    legs.push({
      fromStopId: stopIds[i],
      toStopId: stopIds[i + 1],
      metres: segmentMetres(stopIds[i], stopIds[i + 1]),
    });
  }
  return legs;
}

/**
 * Total distance along a slice of a route, or null if ANY leg is unmeasured.
 *
 * Null rather than a partial sum on purpose. Adding up the legs we happen to
 * know would produce a shorter distance, and a shorter distance produces a
 * cheaper fare, which is exactly the kind of confidently wrong number this
 * project exists to avoid.
 */
export function sumRouteDistance(stopIds: string[]): number | null {
  let total = 0;
  for (let i = 0; i + 1 < stopIds.length; i++) {
    const leg = segmentMetres(stopIds[i], stopIds[i + 1]);
    if (leg == null) return null;
    total += leg;
  }
  return stopIds.length > 1 ? total : null;
}

/** "Sitting Service" is the premium tier, which the official rate does not price. */
function isPremiumService(bus: Bus): boolean {
  return /sitting service/i.test(bus.serviceType ?? '');
}

/**
 * Calculate a fare from the published per-kilometre rate and a real distance.
 *
 * This is an ESTIMATE and is typed as one. It is derived from a rate that the
 * government sets and, in practice, riders are frequently charged more than.
 * It also says nothing about which side of the road the bus runs on, so two
 * riders on opposite sides can be charged differently for the same journey.
 *
 * Returns a blocked estimate rather than null when it cannot be computed, so the
 * UI can explain the absence instead of just showing nothing.
 */
export function estimateFare(
  bus: Bus,
  stopIds: string[],
  distanceMetres: number | null
): FareEstimate | null {
  const base = {
    distanceMetres: distanceMetres ?? 0,
    ratePerKm: farePolicy.rate.cityBus.takaPerKm,
    minimumFareTaka: farePolicy.minimumFareTaka,
    effectiveFrom: farePolicy.effectiveFrom,
    isEstimate: true as const,
  };

  if (isPremiumService(bus)) {
    return { ...base, taka: 0, blockedBy: 'premium-service' };
  }
  if (distanceMetres == null) {
    return { ...base, taka: 0, blockedBy: 'distance-unknown' };
  }
  if (!farePolicy.rate?.cityBus?.takaPerKm) {
    return { ...base, taka: 0, blockedBy: 'no-rate' };
  }

  // Whole taka, because that is what a rider hands over. The minimum matters
  // most on short hops, where the per-km rate alone would fall below it.
  const raw = (distanceMetres / 1000) * farePolicy.rate.cityBus.takaPerKm;
  const taka = Math.max(farePolicy.minimumFareTaka, Math.round(raw));

  return { ...base, taka, blockedBy: null };
}

// ------------------------------------------------- fares reported by riders

/**
 * Fold rider reports into a summary.
 *
 * The median is used rather than the mean on purpose. Fares on one route vary
 * with direction, AC or not, and how much the driver feels like charging, so a
 * mean of a tight cluster and one wild outlier lands somewhere nobody ever
 * paid. The median always lands inside the cluster.
 */
export function summariseCommunityFares(
  amounts: number[]
): CommunityFareSummary | null {
  if (!amounts.length) return null;
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianTaka =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];

  return {
    reportCount: sorted.length,
    medianTaka,
    lowest: sorted[0],
    highest: sorted[sorted.length - 1],
    mostRecent: null,
  };
}

/**
 * Buses that serve a stop, for the stop detail page.
 * Ordered by how central the stop is to the route, so the ones that actually
 * pass through rather than terminate appear first.
 */
export function busesAtStop(stopId: string): { bus: Bus; position: number; total: number }[] {
  const out: { bus: Bus; position: number; total: number }[] = [];
  for (const bus of buses) {
    const position = bus.stopIds.indexOf(stopId);
    if (position !== -1) out.push({ bus, position, total: bus.stopIds.length });
  }
  out.sort((a, b) => {
    // Interior stops beat endpoints, then longer routes, then alphabetical.
    const aEnd = a.position === 0 || a.position === a.total - 1 ? 1 : 0;
    const bEnd = b.position === 0 || b.position === b.total - 1 ? 1 : 0;
    if (aEnd !== bEnd) return aEnd - bEnd;
    return b.total - a.total || a.bus.nameEn.localeCompare(b.bus.nameEn);
  });
  return out;
}
