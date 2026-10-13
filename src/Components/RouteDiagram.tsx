'use client';

/**
 * The route diagram: which stops a bus passes, in which order, and roughly how
 * far apart they are. A marker travels the path so the order reads as a journey
 * rather than a list.
 *
 * WHAT THIS IS NOT
 *
 * This is not a map of Dhaka. The dataset has no coordinates at all, so there is
 * nothing here that knows where any stop actually is. The stops are laid out in
 * the order the bus visits them, which is real information, and the bends between
 * them are decoration chosen to make that order readable. Nothing about the shape
 * should be read as geography, and the UI says so on the diagram itself.
 *
 * The one real number on it is each leg's distance in metres, and only where we
 * have measured it. A leg with no measured distance is drawn as a dashed gap and
 * labelled as unknown, never as 0 km. That is the same rule the fare logic
 * follows: a partial distance would produce a confidently wrong number.
 *
 * The pacing of the marker is proportional to real distance where known, so a
 * long leg takes visibly longer than a short one. Where distance is unknown the
 * leg gets an average pace, which is a guess, and the caption says so.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MdDirectionsBus, MdPause, MdPlayArrow, MdReplay } from 'react-icons/md';
import { getStop, routeLegs, type Journey } from '@/Utils/transit';
import { useLang } from '@/Utils/LangContext';

// ------------------------------------------------------------------- layout

/** Stops per column before the path wraps into a new column. */
const STOPS_PER_COLUMN = 6;
/** Vertical gap between stops, in user units of the SVG. */
const ROW_HEIGHT = 44;
/** Horizontal gap between columns. Wide enough for a stop name beside the dot. */
const COLUMN_WIDTH = 190;
const PADDING = 26;
/** Radius of the rounded corners where the path turns from one column to the next. */
const CORNER = 18;

type Point = { x: number; y: number };

/**
 * Lay the stops out in a snaking grid: down the first column, across the bottom,
 * up the second, and so on, the way a printed transit map is drawn.
 *
 * The snaking is what makes the order readable without pretending to be
 * geography. A straight vertical list works too, but on a 40-stop route it
 * becomes a very long thin ribbon, and the diagram has to fit on a phone.
 */
function layoutPoints(count: number): Point[] {
  const columns = Math.max(1, Math.ceil(count / STOPS_PER_COLUMN));
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    const column = Math.floor(i / STOPS_PER_COLUMN);
    const rowInColumn = i % STOPS_PER_COLUMN;
    // Every second column runs upwards, so the path connects at the bottom.
    const goingUp = column % 2 === 1;
    const row = goingUp ? STOPS_PER_COLUMN - 1 - rowInColumn : rowInColumn;

    points.push({
      x: PADDING + column * COLUMN_WIDTH,
      y: PADDING + row * ROW_HEIGHT,
    });
  }

  // A column that is not full still needs its last stop to sit on the row the
  // path arrives at, otherwise the connector line to the next column is drawn
  // from a row that does not exist and the shape breaks.
  if (columns > 1 && count % STOPS_PER_COLUMN !== 0) {
    const lastColumn = columns - 1;
    const rowsInLastColumn = count % STOPS_PER_COLUMN;
    for (let i = count - rowsInLastColumn; i < count; i++) {
      const rowInColumn = i % STOPS_PER_COLUMN;
      points[i] = {
        ...points[i],
        y: PADDING + (STOPS_PER_COLUMN - 1 - rowInColumn) * ROW_HEIGHT,
      };
    }
    void lastColumn;
  }

  return points;
}

/**
 * Build an SVG path through the points, rounding the corners.
 *
 * A plain polyline would have hard 90-degree joints at every column change, which
 * reads as a technical drawing. Rounding them makes it read as a route.
 */
function pathThrough(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];

    // A rounded corner needs two points: where the straight line stops and where
    // it resumes. Without a segment to round, connecting directly is correct.
    const isCorner =
      i > 1 && i < points.length - 1
        ? (prev.x !== points[i - 1].x && cur.x !== prev.x) ||
          (points[i + 1].y !== cur.y && cur.y !== prev.y)
        : false;

    if (!isCorner) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }

    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outTo = points[i + 1];
    const outLen = Math.hypot(outTo.x - cur.x, outTo.y - cur.y);
    const r = Math.min(CORNER, inLen / 2, outLen / 2);

    const inX = prev.x + ((cur.x - prev.x) / inLen) * r;
    const inY = prev.y + ((cur.y - prev.y) / inLen) * r;
    const outX = cur.x + ((outTo.x - cur.x) / outLen) * r;
    const outY = cur.y + ((outTo.y - cur.y) / outLen) * r;

    d += ` L ${inX} ${inY} Q ${cur.x} ${cur.y} ${outX} ${outY}`;
  }

  return d;
}

// -------------------------------------------------------------------- labels

/** "850 m" under a kilometre, "2.4 km" above it. Never "0.0 km". */
function formatMetres(metres: number | null): string {
  if (metres == null) return '—';
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

// ------------------------------------------------------------------ component

type Props = { journey: Journey };

export default function RouteDiagram({ journey }: Props) {
  const { t, lang, stopName } = useLang();
  const prefersReducedMotion = useReducedMotion();

  const stopsBetween = journey.stopsBetween;
  const count = stopsBetween.length;

  const legs = useMemo(() => routeLegs(stopsBetween), [stopsBetween]);

  const points = useMemo(() => layoutPoints(count), [count]);
  const d = useMemo(() => pathThrough(points), [points]);

  const measuredLegs = legs.filter((l) => l.metres != null);
  const allLegsMeasured = measuredLegs.length === legs.length;

  /**
   * How long each leg takes the marker, in arbitrary units.
   *
   * Measured legs are weighted by their real distance, so the animation reflects
   * the actual shape of the trip. An unmeasured leg gets the mean of the measured
   * ones, which is a guess rather than a fact, so the caption admits it.
   */
  const weights = useMemo(() => {
    if (!legs.length) return [];
    const mean =
      measuredLegs.length > 0
        ? measuredLegs.reduce((s, l) => s + (l.metres ?? 0), 0) / measuredLegs.length
        : 1;
    return legs.map((l) => (l.metres != null ? Math.max(l.metres, 1) : Math.max(mean, 1)));
  }, [legs, measuredLegs]);

  const weightTotal = weights.reduce((a, b) => a + b, 0);

  // Where along the whole path each stop sits, as a fraction. Lets the marker be
  // driven by weighted time instead of by stop index, which is what makes the
  // long legs look long.
  const stopFractions = useMemo(() => {
    const out: number[] = [0];
    let acc = 0;
    for (const w of weights) {
      acc += w;
      out.push(weightTotal > 0 ? acc / weightTotal : 1);
    }
    return out;
  }, [weights, weightTotal]);

  const columns = Math.max(1, Math.ceil(count / STOPS_PER_COLUMN));
  const width = PADDING * 2 + (columns - 1) * COLUMN_WIDTH;
  const height = PADDING * 2 + (STOPS_PER_COLUMN - 1) * ROW_HEIGHT;

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);

  // Roughly 1.1s of travel per leg, floored so a two-stop hop is not instant.
  const totalSeconds = Math.max(2.2, legs.length * 1.1);

  useEffect(() => {
    if (!playing || prefersReducedMotion) return;

    startedAt.current = performance.now();
    // Resume from wherever the marker already is, so pausing and playing again
    // continues the trip instead of restarting it.
    const from = progress;

    const step = (now: number) => {
      // requestAnimationFrame hands back the frame's own timestamp, which can be
      // EARLIER than the performance.now() captured above when the effect starts
      // mid-frame. Without the clamp that yields a negative elapsed, and on a
      // fresh start it drives progress just below zero, which walks the index
      // off the front of the points array and crashes.
      const elapsed = Math.max(0, now - (startedAt.current ?? now));
      const next = Math.min(1, Math.max(0, from + elapsed / (totalSeconds * 1000)));
      if (next >= 1) {
        setProgress(1);
        setPlaying(false);
        return;
      }
      setProgress(next);
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // `progress` is deliberately not a dependency: it is the thing being animated,
    // and depending on it would tear the loop down on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalSeconds, prefersReducedMotion]);

  const restart = () => {
    if (prefersReducedMotion) {
      setProgress(1);
      return;
    }
    setProgress(0);
    setPlaying(true);
  };

  /** Which leg the marker is currently on, and how far along it. */
  const legIndex = useMemo(() => {
    if (count <= 1) return 0;
    for (let i = 0; i + 1 < stopFractions.length; i++) {
      if (progress >= stopFractions[i] && progress <= stopFractions[i + 1]) return i;
    }
    return Math.max(0, legs.length - 1);
  }, [progress, stopFractions, legs.length, count]);

  // The marker's position on the drawn path. Driven by the weighted fractions so
  // it lines up with the legs above rather than counting stops evenly.
  const marker = useMemo(() => {
    if (count === 0) return { x: PADDING, y: PADDING };
    if (count === 1) return points[0];

    // progress is clamped to 0..1 upstream, and the index is clamped into the
    // array on both sides, so this cannot read past either end even if a future
    // change lets progress stray.
    const safe = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    const exact = safe * (points.length - 1);
    const lowIndex = Math.min(
      points.length - 2,
      Math.max(0, Math.floor(exact))
    );
    const t = Math.min(1, Math.max(0, exact - lowIndex));
    const a = points[lowIndex];
    const b = points[lowIndex + 1];
    // A route of one point has no second point to interpolate towards.
    if (!a || !b) return a ?? points[0] ?? { x: PADDING, y: PADDING };
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }, [progress, points, count]);

  /** The stop the marker is at or just past, for the caption. */
  const reachedStops = useMemo(() => {
    let n = 0;
    for (let i = 0; i + 1 < stopFractions.length; i++) {
      if (progress >= stopFractions[i]) n = i + 1;
    }
    return n;
  }, [progress, stopFractions]);

  const currentLeg = legs[legIndex];
  const currentStopId = stopsBetween[Math.min(reachedStops, count - 1)];
  const currentStop = currentStopId ? getStop(currentStopId) : undefined;
  const legIsGuessed = currentLeg ? currentLeg.metres == null : false;

  if (count < 2) return null;

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/40">
      {/* The honest label, above the drawing rather than hidden in a tooltip. */}
      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
        <MdDirectionsBus className="mt-px shrink-0 text-sm" />
        {t(
          'এটি মানচিত্র নয়। স্টপগুলো বাস যেমন পরপর ঠেঙায়, সেই ক্রমেই সাজানো। কোন রাস্তা দিয়ে বাস যায় তা আমরা জানি না।',
          'Not a map. The stops are laid out in the order the bus visits them. We do not know which roads it drives.'
        )}
      </p>

      <div className="mt-3 overflow-x-auto pb-1">
        <svg
          width={width}
          height={height + 18}
          viewBox={`0 0 ${width} ${height + 18}`}
          className="block"
          role="img"
          aria-label={t(
            `পথ: ${journey.stopCount} টি স্টপ পেরিয়ে যাবেন`,
            `Route: ${journey.stopCount} stops between`
          )}
        >
          {/* The full route, faint, so the shape of the whole path is visible
              even before the marker travels it. */}
          <path d={d} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={2} />

          {/* Unmeasured legs are drawn dashed. This is the visual counterpart of
              the `distance-unknown` blocker on the fare: a gap we know about. */}
          {legs.map((leg, i) => {
            if (leg.metres != null) return null;
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) return null;
            return (
              <path
                key={`gap-${leg.fromStopId}-${leg.toStopId}`}
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                fill="none"
                strokeWidth={2}
                strokeDasharray="3 5"
                className="text-gray-300 dark:text-gray-700"
              />
            );
          })}

          {/* The travelled part of the route. */}
          {count > 1 && (
            <motion.path
              d={d}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              className="text-brand-500"
              strokeDasharray={1}
              pathLength={1}
              animate={{ strokeDashoffset: 1 - progress }}
            />
          )}

          {/* Stops. The first and last are the ones the rider picked, so they are
              the only ones drawn in a different colour. */}
          {points.map((pt, i) => {
            const isFirst = i === 0;
            const isLast = i === count - 1;
            const passed = progress >= stopFractions[i] - 0.001;
            const isCurrent = i === reachedStops;
            return (
              <g key={stopsBetween[i]}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isFirst || isLast ? 6 : 4}
                  className={
                    isFirst
                      ? 'fill-brand-600'
                      : isLast
                        ? 'fill-rose-500'
                        : passed
                          ? 'fill-brand-500'
                          : 'fill-white dark:fill-gray-900'
                  }
                  strokeWidth={2}
                  stroke={isFirst || isLast ? 'none' : 'currentColor'}
                />
                {/* Labels alternate sides so two adjacent rows never collide. */}
                {(i % 2 === 0 || isFirst || isLast) && (
                  <text
                    x={pt.x + 12}
                    y={pt.y + 4}
                    fontSize={11}
                    className={
                      isCurrent
                        ? 'fill-brand-700 dark:fill-brand-300'
                        : 'fill-gray-500 dark:fill-gray-400'
                    }
                  >
                    {(() => {
                      const s = getStop(stopsBetween[i]);
                      const name = s ? stopName(s) : stopsBetween[i];
                      const label = lang === 'bn' ? name : s?.nameEn ?? name;
                      return label.length > 22 ? `${label.slice(0, 21)}…` : label;
                    })()}
                  </text>
                )}
              </g>
            );
          })}

          {/* The marker. A halo keeps it visible where it overlaps the line. */}
          <motion.g
            animate={{ x: marker.x, y: marker.y }}
            initial={false}
            transition={{ type: 'tween', duration: 0.05, ease: 'linear' }}
          >
            <circle r={9} className="fill-brand-500/25" />
            <circle r={4.5} className="fill-brand-600 stroke-white dark:stroke-gray-900" strokeWidth={2} />
          </motion.g>
        </svg>
      </div>

      {/* Caption. Says which stop the bus is at and how far the next leg is, and
          admits when that distance is a guess. */}
      <div className="mt-2 min-h-[2.25rem] rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-950/40">
        <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
          {currentStop ? (
            <>
              <span className="font-medium">{stopName(currentStop)}</span>
              {lang === 'bn' ? ' পর্যন্ত পৌঁছেছে' : ' reached'}
              {currentLeg && (
                <>
                  {' · '}
                  {t('পরের লেগ', 'Next leg')}{' '}
                  <span className="tabular-nums">
                    {formatMetres(currentLeg.metres)}
                  </span>
                </>
              )}
            </>
          ) : (
            t('নাম দেখানো যাচ্ছে না', 'Name unavailable')
          )}
        </p>

        {legIsGuessed && (
          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
            {t(
              'এই লেগের দূরত্ব আমরা জানি না, তাই গাড়ির গতি সাধারণ গতিতে দেখানো হচ্ছে।',
              'We do not have this leg measured, so the marker moves at an average pace.'
            )}
          </p>
        )}

        {!allLegsMeasured && !legIsGuessed && (
          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
            {t(
              `এই পথের ${legs.length - measuredLegs.length} টি লেগের দূরত্ব জানা নেই, সেগুলো ছেড়ে দেখানো হয়েছে।`,
              `${legs.length - measuredLegs.length} leg(s) on this route have no measured distance and are left blank.`
            )}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            // Starting from the end would show nothing, so it starts over. From
            // the middle it resumes where the marker is.
            if (progress >= 1) setProgress(0);
            setPlaying(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
        >
          {playing ? <MdPause className="text-sm" /> : <MdPlayArrow className="text-sm" />}
          {playing
            ? t('থামান', 'Pause')
            : progress > 0 && progress < 1
              ? t('চালু করুন', 'Resume')
              : t('পথ দেখান', 'Play route')}
        </button>

        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
        >
          <MdReplay className="text-sm" />
          {t('আবার', 'Replay')}
        </button>

        {journey.distanceMetres != null && (
          <span className="ml-auto text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
            {(journey.distanceMetres / 1000).toFixed(1)} km
          </span>
        )}
      </div>

      {/* A rider who never pressed play still gets the whole order as text. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
          {t('স্টপগুলোর তালিকা', 'List the stops')}
        </summary>
        <ol className="mt-1.5 space-y-0.5">
          {stopsBetween.map((id, i) => {
            const s = getStop(id);
            const leg = i > 0 ? legs[i - 1] : null;
            return (
              <li
                key={id}
                className="flex items-baseline gap-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400"
              >
                <span className="w-5 shrink-0 text-right tabular-nums text-gray-300 dark:text-gray-600">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{s ? stopName(s) : id}</span>
                {leg && (
                  <span className="shrink-0 tabular-nums text-[10px] text-gray-400 dark:text-gray-500">
                    {formatMetres(leg.metres)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {!allLegsMeasured && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
            {t(
              '— মানে দূরত্ব মাপা নেই, শূন্য নয়।',
              '— means not measured, not zero.'
            )}
          </p>
        )}
      </details>
    </div>
  );
}