'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { MdArrowBack, MdSearchOff } from 'react-icons/md';
import { findJourneys, getStop } from '@/Utils/transit';
import ResultCard from '@/Components/ResultCard';
import EndpointEditor from '@/Components/EndpointEditor';
import { useLang } from '@/Utils/LangContext';

type Props = { fromId: string; toId: string };

/**
 * The answers page.
 *
 * The two stop ids come from the URL, not from component state, so a link like
 * /route/gabtoli/banani can be shared, bookmarked, and survives a refresh. A
 * hand-typed URL can also contain a stop id that does not exist, which is why
 * the not-found branch is here rather than assumed away.
 */
export default function RouteResults({ fromId, toId }: Props) {
  const { t, lang, stopName } = useLang();

  const from = getStop(fromId);
  const to = getStop(toId);
  const journeys = useMemo(() => findJourneys(fromId, toId), [fromId, toId]);

  if (!from || !to) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-semibold">{t('এই জায়গাটি খুঁজে পাওয়া যায়নি', 'That place was not found')}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          {t('আবার খুঁজুন', 'Search again')}
        </Link>
      </div>
    );
  }

  const busCount = journeys.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <MdArrowBack className="text-base" />
        {t('নতুন খোঁজা', 'New search')}
      </Link>

      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-4"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {stopName(from)} <span className="px-1">→</span> {stopName(to)}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {busCount}{' '}
          {t(
            busCount === 1 ? 'টি বাস সরাসরি যায়' : 'টি বাস সরাসরি যায়',
            busCount === 1 ? 'bus goes directly' : 'buses go directly'
          )}
        </h1>
      </motion.header>

      <div className="mt-5">
        <EndpointEditor fromId={fromId} toId={toId} />
      </div>

      {busCount === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700"
        >
          <MdSearchOff className="mx-auto text-4xl text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-base font-semibold">
            {t('এই পথে সরাসরি কোনো বাস নেই', 'No direct bus on this route')}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {lang === 'bn'
              ? 'পল্টন বা শাহবাগে ট্রানজিফার করে যেতে পারে। এই সাইটে এখনো ট্রানজিফার দেখানো হয় না।'
              : 'You may need to change at Paltan or Shahbag. This site does not show transfers yet.'}
          </p>
        </motion.div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {journeys.map((journey, i) => (
            <ResultCard key={journey.bus.id} journey={journey} index={i} />
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500">
        {t(
          'কম স্টপের বাস আগে দেখানো হয়েছে, যা সাধারণত দ্রুততম যাত্রা। আমরা ট্রাফিকের প্রকৃত সময় জানি না।',
          'Buses with fewer stops are listed first, which is usually the faster ride. We do not know live traffic times.'
        )}
      </p>
    </div>
  );
}
