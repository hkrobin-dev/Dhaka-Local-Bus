'use client';

/**
 * "I rode this bus. Here's what I paid."
 *
 * This is the door for news and social media claims. A rider can say where they
 * saw it, and for those sources a link is required, so the claim can be checked
 * later by a human instead of being believed on the spot.
 *
 * What happens to the report afterwards is deliberately modest: it is counted and
 * shown as a community figure beside the official rate, with the number of
 * reports visible. It does not become the fare. That is a decision a human makes
 * by reading BRTA's chart, not something a form submission can do.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MdClose, MdHowToVote, MdInfo, MdSend } from 'react-icons/md';
import type { Bus, CommunityFareSummary } from '@/Utils/transit';
import { getStop } from '@/Utils/transit';
import { useLang } from '@/Utils/LangContext';

type Props = {
  bus: Bus;
  /** The trip being priced, so the report is tied to a direction. */
  fromStopId: string;
  toStopId: string;
  onClose: () => void;
};

type Source = 'rider' | 'news' | 'social';

export default function ReportFareDialog({ bus, fromStopId, toStopId, onClose }: Props) {
  const { lang, busName, stopName } = useLang();

  const [taka, setTaka] = useState('');
  const [source, setSource] = useState<Source>('rider');
  const [sourceUrl, setSourceUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState<CommunityFareSummary | null>(null);

  const fromStop = getStop(fromStopId);
  const toStop = getStop(toStopId);

  // Escape closes, and the page behind must not scroll while the sheet is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: bus.id,
          fromStopId,
          toStopId,
          taka: Number(taka),
          source,
          sourceUrl: sourceUrl || undefined,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.error ?? 'Something went wrong.', field: data.field });
        return;
      }
      setDone(data.summary ?? null);
    } catch {
      setError({ message: 'Could not reach the server. Check your connection.' });
    } finally {
      setBusy(false);
    }
  }

  const needsLink = source === 'news' || source === 'social';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-gray-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-5 dark:border-gray-800">
          <div className="min-w-0">
            <h2 id="report-title" className="text-base font-bold">
              {lang === 'bn' ? 'আপনি কত টাকা দিয়েছেন?' : 'What did you pay?'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {busName(bus)} · {fromStop ? stopName(fromStop) : fromStopId} →{' '}
              {toStop ? stopName(toStop) : toStopId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <MdClose />
          </button>
        </div>

        {done ? (
          <div className="p-5">
            <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 dark:bg-brand-950/50">
              <MdHowToVote className="mt-0.5 shrink-0 text-xl text-brand-600 dark:text-brand-400" />
              <div>
                <p className="text-sm font-semibold">
                  {lang === 'bn' ? 'ধন্যবাদ!' : 'Thank you!'}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {lang === 'bn'
                    ? `${done.reportCount} জন এই পথের ভাড়া জানিয়েছেন। সবার মধ্যে মাঝের হিসাব ৳${done.medianTaka} (সবচেয়ে কম ৳${done.lowest}, সবচেয়ে বেশি ৳${done.highest})।`
                    : `${done.reportCount} people have reported this trip. The middle figure is ৳${done.medianTaka} (lowest ৳${done.lowest}, highest ৳${done.highest}).`}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {lang === 'bn'
                    ? 'এটি এখনো সরকারি ভাড়া নয়, তাই আমরা সরকারি হিসাবের সাথেই দেখাচ্ছি।'
                    : 'This is still not the official fare, so it is shown alongside the official estimate rather than instead of it.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {lang === 'bn' ? 'ঠিক আছে' : 'Close'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {lang === 'bn' ? 'কত টাকা?' : 'Fare in taka'}
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-gray-300 px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/12 dark:border-gray-700">
              <span className="text-lg text-gray-400">৳</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={5000}
                required
                autoFocus
                value={taka}
                onChange={(e) => setTaka(e.target.value)}
                placeholder="50"
                className="w-full bg-transparent py-2.5 text-lg font-semibold outline-none"
              />
            </div>

            <fieldset className="mt-4">
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {lang === 'bn' ? 'কোথা থেকে জানালেন?' : 'Where did this come from?'}
              </legend>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {(
                  [
                    { value: 'rider', bn: 'নিজে দিয়েছি', en: 'I paid it' },
                    { value: 'news', bn: 'খবরে লেখা', en: 'A news report' },
                    { value: 'social', bn: 'সোশ্যাল মিডিয়া', en: 'Social media' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSource(opt.value)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                      source === opt.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    {lang === 'bn' ? opt.bn : opt.en}
                  </button>
                ))}
              </div>
            </fieldset>

            {needsLink && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="overflow-hidden"
              >
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {lang === 'bn' ? 'লিংক (ছাড়া গ্রহণ করা হবে না)' : 'Link (required)'}
                </label>
                <input
                  type="url"
                  required
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1.5 w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 dark:border-gray-700"
                />
              </motion.div>
            )}

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {lang === 'bn' ? 'কিছু জানানা চাইলে' : 'Anything to add (optional)'}
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                lang === 'bn'
                  ? 'যেমন: সকালে যাওয়ার পর, ভিডিওতে দেখেছি'
                  : 'e.g. morning ride, saw it in a video'
              }
              className="mt-1.5 w-full resize-none rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 dark:border-gray-700"
            />

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error.message}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !taka}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <MdSend />
              )}
              {lang === 'bn' ? 'জানান' : 'Send report'}
            </button>

            <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              <MdInfo className="mt-px shrink-0" />
              {lang === 'bn'
                ? 'আপনার জানানো ভাড়া সরকারি ভাড়া হিসেবে দেখানো হবে না। এটি সবার জানানোর মাঝের হিসাবের সাথে দেখানো হবে, যাতে আপনি বুঝতে পারেন কতজন মানুষ একই কথা বলছে।'
                : 'Your report is never published as the fare. It is shown as the middle of what riders have reported, with the number of people behind it, so you can judge how well it is agreed.'}
            </p>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
