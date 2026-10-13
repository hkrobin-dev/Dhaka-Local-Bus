'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { MdSearch, MdSwapVert, MdDirectionsBus } from 'react-icons/md';
import StopInput from '@/Components/StopInput';
import { useStopSearch } from '@/Utils/StopSearchContext';
import { useLang } from '@/Utils/LangContext';
import { allBuses } from '@/Utils/transit';

/**
 * The whole search flow: pick two stops, get buses. Deliberately one screen
 * with no wizard, because a rider standing at a terminal wants an answer in a
 * few seconds, not a multi-step form.
 */
export default function SearchForm() {
  const { from, to, ready, swap, reset } = useStopSearch();
  const { t } = useLang();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const busCount = allBuses().length;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || from.id === to.id) return;
    setSubmitting(true);
    router.push(`/route/${from.id}/${to.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <StopInput side="from" />

        {/* On a phone the two inputs stack, so the swap button sits between
            them. On a wide screen it sits to the right, aligned to the fields. */}
        <div className="flex items-end justify-center sm:pb-1">
          <motion.button
            type="button"
            onClick={swap}
            disabled={!from && !to}
            whileTap={{ scale: 0.85, rotate: 180 }}
            transition={{ type: 'spring', stiffness: 450, damping: 16 }}
            aria-label={t('এক জায়গা অদল-বদল করুন', 'Swap locations')}
            className="grid size-11 place-items-center rounded-full border border-gray-300 bg-white text-gray-600 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-35 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-brand-700 dark:hover:text-brand-400 sm:size-10"
          >
            <MdSwapVert className="text-xl" />
          </motion.button>
        </div>

        <StopInput side="to" />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <motion.button
          type="submit"
          disabled={!ready}
          whileHover={ready ? { y: -1 } : {}}
          whileTap={ready ? { scale: 0.97 } : {}}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600 sm:flex-none"
        >
          {submitting ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <MdSearch className="text-lg" />
          )}
          {t('বাস খুঁজুন', 'Find buses')}
        </motion.button>

        <AnimatePresence>
          {(from || to) && (
            <motion.button
              type="button"
              onClick={reset}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              {t('মুছুন', 'Clear')}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <MdDirectionsBus className="text-base shrink-0" />
        <span>
          {busCount} {t('টি লোকাল বাসের তথ্য', 'local buses in this dataset')}
        </span>
      </p>
    </form>
  );
}
