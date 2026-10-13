'use client';

/**
 * The fare, shown honestly.
 *
 * There are three different things this component can display, and they are not
 * interchangeable:
 *
 *   1. A transcribed fare. Someone read BRTA's fare chart and typed the number
 *      in. This is the only kind we will call a fare.
 *   2. An estimate. The published per-kilometre rate multiplied by a real road
 *      distance. Useful, and always labelled, always with its arithmetic shown
 *      so a rider can judge it.
 *   3. Nothing. When the distance is unknown, or the bus is a premium service the
 *      official rate does not cover, or the rate itself is missing.
 *
 * The temptation is to collapse these into one "fare" field. That is exactly how
 * a rider ends up budgeting ৳64 for a journey that costs ৳50, so the types are
 * separate in transit.ts and the states are separate here.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  MdAcUnit,
  MdCheckCircle,
  MdChair,
  MdExpandMore,
  MdHowToVote,
  MdInfo,
  MdLocalOffer,
} from 'react-icons/md';
import type { Bus, FareEstimate } from '@/Utils/transit';
import { farePolicy } from '@/Utils/transit';
import { useLang } from '@/Utils/LangContext';
import { FARE_UNKNOWN } from '@/Utils/constants';

type Props = {
  bus: Bus;
  estimate: FareEstimate | null;
};

/** Why there is no estimate, in the rider's language. */
function blockedReason(estimate: FareEstimate, lang: 'bn' | 'en') {
  switch (estimate.blockedBy) {
    case 'premium-service':
      return lang === 'bn'
        ? 'সিটিং সার্ভিসের ভাড়া আলাদা, সরকারি হিসাবে ধরা হয় না'
        : 'Sitting service fares are set by the owner, not the government rate';
    case 'no-rate':
      return lang === 'bn'
        ? 'সরকারি ভাড়ার হিসাব এখনো নেই'
        : 'No official rate loaded yet';
    case 'distance-unknown':
    default:
      return lang === 'bn'
        ? 'এই পথের দূরত্ব আমাদের কাছে নেই, তাই হিসাব করা যায়নি'
        : 'We do not have the distance for this stretch, so it cannot be worked out';
  }
}

export default function FareDisplay({ bus, estimate }: Props) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);

  const transcribed = bus.fare;

  // --- 1. A fare someone accepted into fares.json.
  if (transcribed) {
    const official = transcribed.source === 'brta';

    return (
      <div className="shrink-0 text-right">
        <p
          className={`flex items-center justify-end gap-1.5 text-2xl font-bold tabular-nums ${
            official ? 'text-fare-600 dark:text-fare-500' : 'text-brand-600 dark:text-brand-400'
          }`}
        >
          {official ? <MdLocalOffer className="text-lg" /> : <MdHowToVote className="text-lg" />}
          ৳{transcribed.amount}
        </p>

        <p className="mt-0.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
          {official ? (
            <span className="inline-flex items-center justify-end gap-1">
              <MdCheckCircle /> BRTA · {transcribed.verifiedAt}
            </span>
          ) : (
            // Never let a rider-agreed number borrow the authority of an
            // official one. Different colour, different label, and the count.
            <span className="block">
              {lang === 'bn' ? 'রাইডারদের জানানো' : 'Rider-reported'}
              {transcribed.reportCount ? ` · ${transcribed.reportCount} ${lang === 'bn' ? 'জন' : 'people'}` : ''}
            </span>
          )}
        </p>
      </div>
    );
  }

  // --- 3. We cannot say anything. Say why, rather than shrugging.
  if (!estimate || estimate.blockedBy) {
    const reason = estimate ? blockedReason(estimate, lang) : null;
    return (
      <div className="shrink-0 text-right">
        <span className="inline-block rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {lang === 'bn' ? FARE_UNKNOWN.bn : FARE_UNKNOWN.en}
        </span>
        {reason && (
          <p className="mt-1 max-w-52 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
            {reason}
          </p>
        )}
      </div>
    );
  }

  // --- 2. An estimate. The number is prominent; the working is one tap away.
  const km = estimate.distanceMetres / 1000;

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group block rounded-lg text-right transition-opacity hover:opacity-80"
      >
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-fare-600/80 dark:text-fare-500/80">
          {lang === 'bn' ? 'আনুমানিক' : 'Estimated'}
        </span>
        <span className="mt-0.5 flex items-center justify-end gap-1 text-2xl font-bold tabular-nums text-fare-600 dark:text-fare-500">
          ৳{estimate.taka}
          <MdExpandMore
            className={`text-base text-gray-400 transition-transform duration-200 dark:text-gray-500 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 text-left text-[11px] leading-relaxed text-gray-600 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {lang === 'bn' ? 'হিসাবটি এমন' : 'How this is worked out'}
              </p>

              <dl className="mt-2 space-y-1">
                <Row
                  label={lang === 'bn' ? 'দূরত্ব' : 'Distance'}
                  value={`${km.toFixed(1)} km`}
                />
                <Row
                  label={lang === 'bn' ? 'হার' : 'Rate'}
                  value={`৳${estimate.ratePerKm.toFixed(2)}/km`}
                />
                <Row
                  label={lang === 'bn' ? 'সর্বনিম্ন' : 'Minimum'}
                  value={`৳${estimate.minimumFareTaka}`}
                />
                <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold dark:border-gray-700">
                  <dt>৳{estimate.taka}</dt>
                  <dd className="text-gray-400 dark:text-gray-500">
                    {km.toFixed(1)} × {estimate.ratePerKm.toFixed(2)}
                  </dd>
                </div>
              </dl>

              {/* The two things that make this an estimate and not a fare. */}
              <ul className="mt-2.5 space-y-1.5 border-t border-gray-200 pt-2.5 dark:border-gray-700">
                <li className="flex gap-1.5">
                  <MdInfo className="mt-px shrink-0 text-sm" />
                  <span>
                    {lang === 'bn'
                      ? `সরকারি হার ${farePolicy.rate.cityBus.previous} থেকে ${estimate.ratePerKm.toFixed(2)} টাকা/কিমি, ${farePolicy.effectiveFrom} থেকে। কিন্তু অনেক সময় এই হার মানা হয় না, তাই বাস্তবে এর চেয়ে বেশি লাগতে পারে।`
                      : `The official rate went from ৳${farePolicy.rate.cityBus.previous} to ৳${estimate.ratePerKm.toFixed(2)} per km on ${farePolicy.effectiveFrom}. It is often not enforced in practice, so you may be charged more.`}
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <MdAcUnit className="mt-px shrink-0 text-sm" />
                  <span>
                    {lang === 'bn'
                      ? 'এই বাসটি এসি নাকি ডিজেল, তা আমাদের কাছে নেই। সরকারি হার সাধারণ ডিজেল বাসের জন্য; এসি বা সিএনজি বাসে ভাড়া আলাদা।'
                      : 'We do not know whether this bus is AC or diesel. The official rate covers ordinary diesel buses; AC and CNG buses are priced differently.'}
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <MdChair className="mt-px shrink-0 text-sm" />
                  <span>
                    {lang === 'bn'
                      ? 'দূরত্ব দুই জায়গার মাঝের রাস্তা, বাস যে রাস্তায় যায় ঠিক সেটা নয়।'
                      : 'The distance is the road between the two places, not necessarily the road this bus takes.'}
                  </span>
                </li>
              </ul>

              {farePolicy.sources[0] && (
                <a
                  href={farePolicy.sources[0].url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2.5 block truncate text-[10px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  {lang === 'bn' ? 'সূত্র' : 'Source'}: {farePolicy.sources[0].publisher}
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
