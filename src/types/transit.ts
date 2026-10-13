/**
 * Shape of the data the app works with.
 *
 * The types here describe data/generated/*.json, which is produced by
 * scripts/build-dataset.mjs. Nothing at runtime ever reads the raw source file
 * or the alias overrides, so editing those and re-running the build is the only
 * way the dataset changes.
 */

export type Fare = {
  /** Whole taka. BRTA publishes whole figures, not fractions. */
  amount: number;
  /** ISO date printed on the fare list the number came from. */
  verifiedAt: string;
  /** 'brta' for the official list, 'community' for a rider correction. */
  source: 'brta' | 'community';
  /** Present on a community fare: how many riders agreed on this number. */
  reportCount?: number;
  /** A link to the report, when there is one. Lets anyone check the claim. */
  sourceUrl?: string | null;
  /** Free-text note from whoever added it. */
  note?: string;
};

export type Stop = {
  /** Stable slug. Used as a foreign key everywhere. Never reuse an id. */
  id: string;
  /** The spelling that appears most often in the source data. */
  nameEn: string;
  /** null when we do not have a confident Bangla name. See overrides file. */
  nameBn: string | null;
  /** Every other spelling people typed for this place, for search. */
  aliases: string[];
  /** How many of the 156 buses serve this stop. */
  busCount: number;
  /**
   * WGS84 position, or null.
   *
   * Null for all 258 stops today. The source dataset is hand-typed stop names
   * with no coordinates at all, and nothing in this repo geocodes. The fields
   * exist so that coordinates can be added later without reshaping the dataset
   * first, the same way `stop-distances.json` was.
   */
  lat: number | null;
  lng: number | null;
};

export type Bus = {
  id: string;
  nameEn: string;
  nameBn: string | null;
  /** Ordered. This is the basis of "how many stops between A and B". */
  stopIds: string[];
  /** [firstStop, lastStop]. The two ends riders actually name the bus by. */
  endpoints: [string, string];
  /** e.g. 'Sitting Service(Check System)'. Free text, inconsistent in source. */
  serviceType: string | null;
  /**
   * Always null in practice. The source pointed every photo at one Firebase
   * bucket that Google has since switched off, so the URLs are stripped during
   * the build rather than rendered as 156 broken images.
   */
  image: string | null;
  /** 'source-image-dead' when a URL existed but no longer resolves. */
  imageUnavailable: 'source-image-dead' | 'none-in-source' | null;
  /** Present on only 11 of 156 buses and not reliable. Never display it. */
  sourceTime: string | null;
  /** A fare transcribed by a human from the BRTA chart. Null for all so far. */
  fare: Fare | null;
  /** Number of legs on the route. */
  routeSegments: number;
  /** Legs for which a real road distance is known. */
  routeSegmentsWithDistance: number;
  /** True when every leg on the whole route is measured. */
  distanceComplete: boolean;
};

export type StopsFile = { generatedAt: string; stops: Stop[] };
export type BusesFile = { generatedAt: string; buses: Bus[] };

/** data/generated/distances.json */
export type DistancesFile = {
  generatedAt: string;
  fetchedAt: string;
  source: { repo: string; file: string; note: string };
  /** "stopA|stopB" (ids sorted) -> metres by road. */
  metres: Record<string, number>;
};

/**
 * OPTIONAL input, not currently present: data/source/stop-coordinates.json
 *
 * Shape:
 *   { "coordinates": { "paltan": [23.7294, 90.4084], ... } }
 *
 * Keyed by OUR canonical stop ids so build-dataset.mjs can join without knowing
 * anything about spelling. Like stop-distances.json this file is meant to be
 * produced once by a separate network script and committed, so a build never
 * depends on an API being reachable.
 *
 * The build treats it as optional. With no file there are no coordinates, and
 * the route diagram falls back to stop order only. If the file IS present, a
 * coordinate pointing at an id that does not exist fails the build loudly,
 * because a geocoded point for a stop nobody has is worse than no point.
 */
export type StopCoordinatesFile = {
  fetchedAt?: string;
  source?: { repo?: string; file?: string; note?: string };
  coordinates: Record<string, [number, number]>;
};

/**
 * data/source/fare-policy.json
 *
 * BRTA prices city buses as a rate per kilometre rather than a price per route.
 * This is that published rate, with the sources it came from. Keeping it as data
 * rather than a constant means the UI can always show where a number came from
 * and when it stops being valid.
 */
export type FarePolicy = {
  policyId: string;
  effectiveFrom: string;
  announcedOn: string;
  area: string;
  appliesTo: { vehicle: string; note: string };
  rate: {
    cityBus: { takaPerKm: number; previous: number; changePaisa: number };
    minibus: { takaPerKm: number; previous: number; changePaisa: number };
  };
  minimumFareTaka: number;
  enforcement: { level: string; note: string };
  sources: {
    publisher: string;
    title: string;
    url: string;
    supports: string[];
    verified: string;
  }[];
  rejectedSources: {
    publisher: string;
    url: string;
    quoted: string;
    whyRejected: string;
  }[];
  rounding: { toTaka: boolean; note: string };
};

/**
 * A fare calculated from the official rate and a real road distance.
 *
 * This is deliberately a different type from Fare. An estimate is derived and
 * carries its assumptions; a Fare is transcribed from the official chart. The UI
 * must never render one as the other, so they cannot be confused by accident.
 */
export type FareEstimate = {
  taka: number;
  distanceMetres: number;
  ratePerKm: number;
  minimumFareTaka: number;
  /** ISO date the rate took effect, so the estimate can go stale visibly. */
  effectiveFrom: string;
  /** Why there is no estimate, when there is not one. */
  blockedBy: FareEstimateBlocker | null;
  /** Always true. Present so the UI is forced to acknowledge it. */
  isEstimate: true;
};

export type FareEstimateBlocker =
  /** Some leg of this trip has no measured distance. */
  | 'distance-unknown'
  /** Premium "sitting service" buses are not priced by the official rate. */
  | 'premium-service'
  /** No official rate is loaded, e.g. the policy file is missing. */
  | 'no-rate';

/** A fare a rider says they actually paid. Never published as the fare. */
export type CommunityFare = {
  busId: string;
  /** Which end of the route the rider travelled from, for context. */
  fromStopId: string;
  toStopId: string;
  taka: number;
  /** Where the claim came from. */
  source: 'rider' | 'news' | 'social';
  /** Required for news and social. A bare claim is not checkable. */
  sourceUrl: string | null;
  reportedAt: string;
  /** Free text. Usually a note about where or when it was paid. */
  note: string;
};

/** What a group of reports adds up to, shown apart from any official figure. */
export type CommunityFareSummary = {
  reportCount: number;
  /** Median, not mean: one person reporting 500 taka should not move it much. */
  medianTaka: number | null;
  lowest: number;
  highest: number;
  mostRecent: string | null;
};

