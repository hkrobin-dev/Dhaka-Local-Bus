/**
 * The fare review queue.
 *
 * This page is the answer to "who decides a fare, and how". A maintainer looks
 * at what riders have reported, sees whether they agree, and either accepts the
 * number into data/overrides/fares.json or throws it away. Nothing reaches the
 * fare file without a person choosing it.
 *
 * Two things this page will not do, on purpose:
 *
 *   - It will not show a single report as a candidate. One person remembering
 *     one price is a rumour, not a fare, so the group is listed as "not enough"
 *     and cannot be accepted.
 *   - It will not accept a number a maintainer has not confirmed. The amount
 *     box is pre-filled with the median purely as a starting point; if the
 *     right answer differs, the maintainer changes it.
 *
 * The data arrives as serialisable props from the server, so the client bundle
 * never touches the reports file or the admin token check. The token lives in a
 * form field and is posted per request; it is never stored or embedded.
 */

'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  MdCheckCircle,
  MdGroup,
  MdLink,
  MdLock,
  MdOpenInNew,
  MdWarning,
} from 'react-icons/md';
import type { PendingGroup } from '@/Services/pendingFares';
import { useLang } from '@/Utils/LangContext';

const CONSENSUS_COPY = {
  strong: {
    bn: { label: 'সবাই মিলেছে', tone: 'text-brand-600 dark:text-brand-400' },
    en: { label: 'Riders agree', tone: 'text-brand-600 dark:text-brand-400' },
  },
  mixed: {
    bn: { label: 'মতভেদ আছে', tone: 'text-fare-600 dark:text-fare-500' },
    en: { label: 'Reports differ', tone: 'text-fare-600 dark:text-fare-500' },
  },
  single: {
    bn: { label: 'একজনই জানিয়েছে', tone: 'text-gray-500 dark:text-gray-400' },
    en: { label: 'One report only', tone: 'text-gray-500 dark:text-gray-400' },
  },
} as const;

type Props = {
  groups: PendingGroup[];
  adminConfigured: boolean;
  currentFares: Record<string, { amount: number; source: string }>;
};

export default function FareReview({ groups, adminConfigured, currentFares }: Props) {
  const { lang, t } = useLang();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ group: string; ok: boolean; text: string } | null>(null);

  async function promote(group: PendingGroup, amount: number) {
    if (!token) {
      setMessage({ group: group.key, ok: false, text: t('আগে টোকেন দিন', 'Enter the admin token first') });
      return;
    }
    setBusy(group.key);
    setMessage(null);
    try {
      const res = await fetch('/api/fares/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: group.busId,
          amount,
          source: 'community',
          verifiedAt: new Date().toISOString().slice(0, 10),
          reportCount: group.summary.reportCount,
          sourceUrl: group.reports.find((r) => r.sourceUrl)?.sourceUrl ?? null,
          token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ group: group.key, ok: false, text: data.error ?? 'Failed.' });
      } else {
        setMessage({
          group: group.key,
          ok: true,
          text: t(
            `fares.json-এ যোগ হয়েছে। এখন npm run data:build চালান।`,
            `Added to fares.json. Now run npm run data:build.`
          ),
        });
      }
    } catch {
      setMessage({ group: group.key, ok: false, text: 'Network error.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">ভাড়া যাচাই / Fare review</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        রাইডারদের জানানো ভাড়া এখানে জমা হয়। কোনোটি <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">fares.json</code>{' '}
        ফাইলে যাবে কি না তা একজন মানুষ ঠিক করেন।
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        Rider reports land here. A person decides whether any of them move into
        <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">fares.json</code>. Nothing gets
        there automatically.
      </p>

      {!adminConfigured && (
        <div className="mt-6 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <MdLock className="mt-0.5 shrink-0 text-xl text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              FARE_ADMIN_TOKEN সেট করা নেই / No admin token configured
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-700/90 dark:text-red-300/90">
              তাই কোনো ভাড়া গ্রহণ করা যাবে না। <code>.env.local</code> ফাইলে{' '}
              <code>FARE_ADMIN_TOKEN=একটি লম্বা র‍্যান্ডম স্ট্রিং</code> লিখে ডেভ সার্ভার আবার চালু করুন।
              এটি না থাকলে কেউই ভাড়া বদলাতে পারবে না — এটাই আসল কারণ।
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-700/90 dark:text-red-300/90">
              So no fare can be accepted. Set <code>FARE_ADMIN_TOKEN</code> to a long random string
              in <code>.env.local</code> and restart. That it is unset is the safe default, not a bug.
            </p>
          </div>
        </div>
      )}

      {adminConfigured && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/50">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('অ্যাডমিন টোকেন', 'Admin token')}
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="FARE_ADMIN_TOKEN"
            autoComplete="off"
            className="mt-1.5 w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 font-mono text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 dark:border-gray-700"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t(
              'টোকেন ব্রাউজারে পাঠানো হয়, কিন্তু কোথাও সংরক্ষণ করা হয় না। পেজ রিফ্রেশ করলে মুছে যাবে।',
              'The token is sent with each request and stored nowhere. It is gone on refresh.'
            )}
          </p>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <MdGroup className="mx-auto text-4xl text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-base font-semibold">
            {t('এখনো কোনো ভাড়া জানানো হয়নি', 'No fare reports yet')}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
            {lang === 'bn'
              ? 'ফলাফল পাতার "ভাড়া জানান" বোতাম থেকে রাইডাররা জানাতে পারবে।'
              : 'Riders can submit from the "Report fare" button on any result.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {groups.map((group, i) => {
            const copy = CONSENSUS_COPY[group.consensus][lang];
            const existing = currentFares[group.busId];
            const { medianTaka, reportCount, lowest, highest } = group.summary;

            return (
              <motion.article
                key={group.key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold">
                      {lang === 'bn' ? group.busNameBn || group.busNameEn : group.busNameEn}
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {group.fromName} → {group.toName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold tabular-nums text-fare-600 dark:text-fare-500">
                      ৳{medianTaka}
                    </p>
                    <p className={`text-[11px] font-medium ${copy.tone}`}>{copy.label}</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-950/40">
                  {[
                    { label: t('জন', 'people'), value: reportCount },
                    { label: t('সবচেয়ে কম', 'lowest'), value: `৳${lowest}` },
                    { label: t('মাঝের', 'median'), value: `৳${medianTaka}` },
                    { label: t('সবচেয়ে বেশি', 'highest'), value: `৳${highest}` },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <dd className="text-sm font-bold tabular-nums">{stat.value}</dd>
                      <dt className="text-[10px] text-gray-500 dark:text-gray-400">{stat.label}</dt>
                    </div>
                  ))}
                </dl>

                {group.consensus === 'single' ? (
                  <p className="mt-3 flex gap-1.5 rounded-lg bg-gray-50 p-2.5 text-xs leading-relaxed text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
                    <MdWarning className="mt-px shrink-0" />
                    {lang === 'bn'
                      ? 'একজন মানুষ একবার জানিয়েছেন। এটি যথেষ্ট নয়, তাই গ্রহণ করা যাবে না। আরেকজন একই ভাড়া জানালে এটি বিবেচনার জন্য আসবে।'
                      : 'Only one person has reported this. That is not enough to accept, so it cannot be promoted. When a second person reports the same amount it will appear here for review.'}
                  </p>
                ) : group.consensus === 'mixed' ? (
                  <p className="mt-3 flex gap-1.5 rounded-lg bg-fare-500/5 p-2.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    <MdWarning className="mt-px shrink-0" />
                    {lang === 'bn'
                      ? 'রিপোর্টগুলো একটু আলাদা। ভাড়া বাসের দিক, এসি-নন-এসি, বা সময়ের উপর নির্ভর করে, তাই এটা স্বাভাবিক হতে পারে। গ্রহণ করার আগে কারণ ভাবুন।'
                      : 'The reports differ. Fares vary by direction, AC or not, and time, so this may be normal. Think about why before accepting.'}
                  </p>
                ) : null}

                {existing && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <MdCheckCircle className="text-brand-500" />
                    {lang === 'bn'
                      ? `এই বাসের ভাড়া ইতিমধ্যে আছে: ৳${existing.amount} (${existing.source})। নতুন করে গ্রহণ করলে সেটি বদলে যাবে।`
                      : `This bus already has a fare: ৳${existing.amount} (${existing.source}). Accepting will replace it.`}
                  </p>
                )}

                <ul className="mt-3 space-y-1.5">
                  {group.reports.map((r, ri) => (
                    <li key={`${r.reportedAt}-${ri}`} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-800">
                        {r.taka}
                      </span>
                      <span className="shrink-0">{r.source}</span>
                      <span className="truncate">{new Date(r.reportedAt).toLocaleDateString()}</span>
                      {r.note && <span className="truncate italic">&ldquo;{r.note}&rdquo;</span>}
                      {r.sourceUrl && (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ml-auto inline-flex shrink-0 items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
                        >
                          <MdLink /> {t('যাচাই', 'check')}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>

                {group.consensus !== 'single' && adminConfigured && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('গ্রহণ করুন', 'Accept')}
                    </label>
                    <input
                      type="number"
                      defaultValue={medianTaka ?? undefined}
                      min={1}
                      max={5000}
                      id={`amount-${group.key}`}
                      className="w-24 rounded-lg border border-gray-300 bg-transparent px-2.5 py-1.5 text-sm font-semibold tabular-nums outline-none focus:border-brand-500 dark:border-gray-700"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('টাকা', 'taka')}
                    </span>
                    <button
                      type="button"
                      disabled={busy === group.key}
                      onClick={() => {
                        const input = document.getElementById(
                          `amount-${group.key}`
                        ) as HTMLInputElement | null;
                        promote(group, Number(input?.value));
                      }}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busy === group.key ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <MdOpenInNew className="text-sm" />
                      )}
                      {t('ফাইলে যোগ করুন', 'Add to fares.json')}
                    </button>
                  </div>
                )}

                {message?.group === group.key && (
                  <p
                    className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
                      message.ok
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                    }`}
                  >
                    {message.text}
                  </p>
                )}
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}
