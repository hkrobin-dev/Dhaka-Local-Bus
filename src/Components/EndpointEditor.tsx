'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { MdSwapVert } from 'react-icons/md';
import StopInput from '@/Components/StopInput';
import { useStopSearch } from '@/Utils/StopSearchContext';
import { useLang } from '@/Utils/LangContext';
import { getStop } from '@/Utils/transit';

/**
 * Lets a rider who picked the wrong landmark correct it without going back to
 * the home page.
 *
 * The two inputs are driven by context, not by the URL, so this component seeds
 * the context from the URL on mount and then pushes a new URL whenever the
 * selection changes. Without the seeding step the fields would render empty on
 * a shared link.
 */
export default function EndpointEditor({
  fromId,
  toId,
}: {
  fromId: string;
  toId: string;
}) {
  const { from, to, setStop, swap, ready } = useStopSearch();
  const { t } = useLang();
  const router = useRouter();

  const fromStop = getStop(fromId);
  const toStop = getStop(toId);

  // Seed from the URL, once, when the page loads.
  useEffect(() => {
    if (fromStop) setStop('from', fromStop);
    if (toStop) setStop('to', toStop);
    // Intentionally runs only when the URL ids change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId]);

  // Push the new URL when the rider picks a different endpoint.
  useEffect(() => {
    if (!from || !to) return;
    if (from.id === fromId && to.id === toId) return;
    router.replace(`/route/${from.id}/${to.id}`);
  }, [from, to, fromId, toId, router]);

  function onSwap() {
    swap();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) router.push(`/route/${from!.id}/${to!.id}`);
      }}
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/50"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <StopInput side="from" />

        <div className="flex items-end justify-center sm:pb-1">
          <motion.button
            type="button"
            onClick={onSwap}
            whileTap={{ scale: 0.85, rotate: 180 }}
            transition={{ type: 'spring', stiffness: 450, damping: 16 }}
            aria-label={t('এক জায়গা অদল-বদল করুন', 'Swap locations')}
            className="grid size-11 place-items-center rounded-full border border-gray-300 bg-white text-gray-600 transition-colors hover:border-brand-400 hover:text-brand-600 sm:size-10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-brand-700 dark:hover:text-brand-400"
          >
            <MdSwapVert className="text-xl" />
          </motion.button>
        </div>

        <StopInput side="to" />
      </div>

      {/* Without this the swap button on the results page would change the
          fields but leave the old results on screen. */}
      {ready && (from?.id !== fromId || to?.id !== toId) && (
        <motion.button
          type="submit"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 w-full rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {t('ফলাফল দেখুন', 'Show results')}
        </motion.button>
      )}
    </form>
  );
}
