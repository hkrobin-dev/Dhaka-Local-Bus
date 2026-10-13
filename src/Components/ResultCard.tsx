'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MdAcUnit, MdChair, MdEditNote, MdExpandMore, MdInfo, MdMap, MdRoute } from 'react-icons/md';
import type { Bus, Journey } from '@/Utils/transit';
import { getStop, isJourneyPlottable } from '@/Utils/transit';
import { useLang } from '@/Utils/LangContext';
import FareDisplay from '@/Components/FareDisplay';
import BusBadge from '@/Components/BusBadge';
import GoogleMapsLinks from '@/Components/GoogleMapsLinks';
import RouteDiagram from '@/Components/RouteDiagram';
import RouteMap from '@/Components/RouteMap';
import ReportFareDialog from '@/Components/ReportFareDialog';

/** "Sitting Service" is a nicer bus. "Check System" means ticket, not cash. */
function describeService(bus: Bus) {
  const raw = bus.serviceType ?? '';
  return {
    airConditioned: /ac|air.?condition/i.test(raw),
    sitting: /sitting service/i.test(raw),
    ticket: /ticket/i.test(raw),
    raw,
  };
}

export default function ResultCard({ journey, index }: { journey: Journey; index: number }) {
  const { lang, busName, stopName, t } = useLang();
  const { bus, stopsBetween } = journey;
  const service = describeService(bus);
  const [reporting, setReporting] = useState(false);
  const [showStops, setShowStops] = useState(false);
  // The diagram is opt-in and only mounts when opened, so a page of 30 results
  // does not build 30 SVG paths and 30 animation loops on load.
  const [showDiagram, setShowDiagram] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // The real map needs a coordinate for every stop on the route. Until the
  // dataset has them for all 258, most routes fall back to the schematic, so the
  // button is only offered where a map will actually draw something.
  const canMap = isJourneyPlottable(journey.stopsBetween);

  const boarding = getStop(stopsBetween[0]);
  const alighting = getStop(stopsBetween[stopsBetween.length - 1]);

  // The stops strictly between the two the rider picked. The boarding and
  // alighting stops are already named above, so repeating them here would be
  // noise rather than information.
  const intermediate = stopsBetween.slice(1, -1);
  // Some routes run past 40 stops. Shown collapsed until asked for, so a card
  // stays scannable when a result list is long.
  const PREVIEW = 8;
  const shownStops = showStops ? intermediate : intermediate.slice(0, PREVIEW);
  const hiddenCount = intermediate.length - shownStops.length;

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        // Cap the stagger. 30 results should not take three seconds to appear.
        transition={{ duration: 0.4, delay: Math.min(index, 12) * 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="card-lift overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/50"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <BusBadge nameEn={bus.nameEn} nameBn={bus.nameBn} />

              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-tight">{busName(bus)}</h3>
                <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                  {lang === 'bn' ? bus.nameEn : bus.nameBn}
                </p>

                {service.raw && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {service.airConditioned ? (
                      <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                        <MdAcUnit /> {t('এসি', 'AC')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <MdChair /> {t('নন-এসি', 'Non-AC')}
                      </span>
                    )}
                    {service.sitting && <span>{t('সিটিং', 'Sitting')}</span>}
                    {service.ticket && <span>{t('টিকেট', 'Ticket')}</span>}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* The fare is what riders scan for first, so it gets the most weight
              on the card and sits top-right. */}
          <FareDisplay bus={bus} estimate={journey.fare} />
        </div>

        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4 dark:border-gray-800 dark:bg-gray-950/30">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t('ওঠার জায়গা', 'Board at')}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">
                {boarding ? stopName(boarding) : '—'}
              </p>
            </div>

            <svg
              className="h-4 w-16 shrink-0 text-gray-300 dark:text-gray-600"
              viewBox="0 0 64 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 8h56"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                strokeLinecap="round"
              />
              <path
                d="M56 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div className="min-w-0 flex-1 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t('নামবেন', 'Get off at')}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">
                {alighting ? stopName(alighting) : '—'}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <MdInfo className="shrink-0 text-sm" />
              {journey.stopCount} {t('টি স্টপ পেরিয়ে যাবেন', 'stops between')}
              {journey.distanceMetres != null && (
                <>
                  {' · '}
                  {(journey.distanceMetres / 1000).toFixed(1)} km
                </>
              )}
            </p>

            <div className="flex items-center gap-1">
              {/* The real map, where the dataset has coordinates for the whole
                  route. Preferred over the diagram when it is available. */}
              {canMap && (
                <button
                  type="button"
                  onClick={() => setShowMap((s) => !s)}
                  aria-expanded={showMap}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
                >
                  <MdMap className="text-sm" />
                  {showMap ? t('মানচিত্র লুকান', 'Hide map') : t('মানচিত্র', 'Map')}
                </button>
              )}

              {/* The route drawn out, so the order can be read as a journey. */}
              <button
                type="button"
                onClick={() => setShowDiagram((s) => !s)}
                aria-expanded={showDiagram}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
              >
                <MdMap className="text-sm" />
                {showDiagram
                  ? t('পথ লুকান', 'Hide route')
                  : t('পথ দেখুন', 'See the route')}
                <MdExpandMore
                  className={`text-sm transition-transform duration-200 ${
                    showDiagram ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Which road the bus actually takes. "Stops between" is a count,
                  and a count cannot tell a rider whether this is the bus that
                  goes past their landmark. Naming the stops can. */}
              {intermediate.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowStops((s) => !s)}
                  aria-expanded={showStops}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
                >
                  <MdRoute className="text-sm" />
                  {showStops
                    ? t('স্টপ লুকান', 'Hide stops')
                    : t('স্টপগুলো দেখুন', 'See the stops')}
                  <MdExpandMore
                    className={`text-sm transition-transform duration-200 ${
                      showStops ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              )}

              {/* The way fares actually get filled in. */}
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
              >
                <MdEditNote className="text-sm" />
                {t('ভাড়া জানান', 'Report fare')}
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showMap && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <RouteMap journey={journey} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Maps works from stop names, so it is always offered —
              even when the in-app map has no coordinates to draw. Includes
              the passenger's own "where am I" location share. */}
          {boarding && alighting && (
            <GoogleMapsLinks
              boardingEn={boarding.nameEn}
              alightingEn={alighting.nameEn}
            />
          )}

          <AnimatePresence initial={false}>
            {showDiagram && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <RouteDiagram journey={journey} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {showStops && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <ol className="mt-3 space-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
                  {shownStops.map((stopId, i) => {
                    const stop = getStop(stopId);
                    return (
                      <li
                        key={stopId}
                        className="flex items-baseline gap-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400"
                      >
                        <span className="w-6 shrink-0 text-right tabular-nums text-gray-300 dark:text-gray-600">
                          {i + 2}
                        </span>
                        <span
                          className={
                            stop
                              ? 'truncate'
                              : 'truncate italic text-gray-400 dark:text-gray-500'
                          }
                        >
                          {stop ? stopName(stop) : stopId}
                        </span>
                      </li>
                    );
                  })}

                  {hiddenCount > 0 && (
                    <li className="pl-8 text-[11px] text-gray-400 dark:text-gray-500">
                      {t(`আরও ${hiddenCount} টি স্টপ`, `${hiddenCount} more stops`)}
                    </li>
                  )}
                </ol>

                {/* Say where this list comes from. It is the source route order,
                    and it is not necessarily every stop the bus makes in between
                    — some intermediate stops were never recorded. */}
                <p className="mt-2 pl-8 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                  {t(
                    'এগুলো বাসটির তালিকাভুক্ত স্টপ, ধারাবাহিকভাবে বাস যেখানে যায় সেই অনুযায়ী। মাঝখানের সব স্টপ তালিকায় নাও থাকতে পারে।',
                    'These are the stops recorded for this bus, in the order it travels. Not every stop in between may be listed.'
                  )}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.article>

      <AnimatePresence>
        {reporting && (
          <ReportFareDialog
            bus={bus}
            fromStopId={stopsBetween[0]}
            toStopId={stopsBetween[stopsBetween.length - 1]}
            onClose={() => setReporting(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
