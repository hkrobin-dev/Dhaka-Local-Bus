import type { Metadata } from 'next';
import review from '@/data/generated/review-needed.json';
import farePolicy from '@/data/generated/fare-policy.json';
import type { FarePolicy } from '@/types/transit';

export const metadata: Metadata = {
  title: 'তথ্যের উৎস | Data sources',
  description: 'Where this bus data comes from, and what is not verified yet.',
};

/**
 * A plain server-rendered page listing exactly what is real and what is not.
 * A transit site that hides its gaps is worse than one without data, so this
 * is deliberately specific and specific numbers.
 */
export default function DataPage() {
  const c = review.counts;
  const policy = farePolicy as FarePolicy;

  const mergedPairs = review.warnings.filter((w) => w.kind === 'merged-spellings');
  const suspects = review.warnings.filter((w) => w.kind === 'suspect-merge');

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">তথ্যের উৎস ও সীমাবদ্ধতা</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Data sources and known limitations
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">যা আমরা জানি / What we have</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'বাস / Buses', value: c.buses, good: true },
            { label: 'থামা / Stops', value: c.stops, good: true },
            { label: 'বানান মিলানো / Spellings merged', value: `${c.spellingsMerged}`, good: true },
            { label: 'ভাড়া যাচাই / Verified fares', value: `${c.busesWithFare}/${c.buses}`, good: false },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/50"
            >
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.label}</dt>
              <dd
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  stat.good ? 'text-brand-600 dark:text-brand-400' : 'text-fare-600 dark:text-fare-500'
                }`}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          বাংলা নাম / Bangla stop names: {c.stopsWithBanglaName}/{c.stops}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">ভাড়া / Fares</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          BRTA ঢাকার শহরের বাসের ভাড়া নির্ধারণ করে প্রতি কিলোমিটারে, প্রতিটি রুটে আলাদা করে নয়। তাই
          আমরা যে হিসাবটি দেখাই তা হলো <strong>সরকারি হার × দুই জায়গার প্রকৃত দূরত্ব</strong> — এটি
          আনুমানিক হিসাব, ভাড়া নয়।
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          BRTA sets city bus fares as a rate per kilometre rather than a price per route, so the
          figure we show is the published rate multiplied by the real road distance: an{' '}
          <strong>estimate, not a fare</strong>.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: 'সরকারি হার / Official rate',
              value: `৳${policy.rate.cityBus.takaPerKm.toFixed(2)}/km`,
              sub: `${policy.effectiveFrom} থেকে · was ৳${policy.rate.cityBus.previous}`,
            },
            {
              label: 'সর্বনিম্ন ভাড়া / Minimum fare',
              value: `৳${policy.minimumFareTaka}`,
              sub: 'ছোট পথে এটাই প্রযোজ্য',
            },
            {
              label: 'হিসাবযোগ্য পথ / Trips we can price',
              value: `${Math.round((c.journeysEstimable / c.journeysTotal) * 100)}%`,
              sub: `${c.journeysEstimable} / ${c.journeysTotal} সম্ভাব্য ভ্রমণ`,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/50"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-fare-600 dark:text-fare-500">
                {card.value}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* The caveats are the substance of this section, not fine print. */}
        <div className="mt-4 rounded-xl border border-fare-500/30 bg-fare-500/5 p-4 dark:border-fare-600/30 dark:bg-fare-600/10">
          <p className="text-sm font-semibold text-fare-600 dark:text-fare-500">
            কেন এটি শুধু আনুমানিক / Why this is only an estimate
          </p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            <li>
              • <strong>হার মানা হয় না।</strong> যে হার সরকারি, সেটি প্রায়ই মানা হয় না এবং
              অভিযোগ আছে যে বেশি নেওয়া হয়। তাই বাস্তব ভাড়া এই হিসাবের চেয়ে বেশি হতে পারে।{' '}
              <span className="text-gray-600 dark:text-gray-400">
                The official rate is frequently not enforced and overcharging is reported, so the
                real fare can be higher.
              </span>
            </li>
            <li>
              • <strong>এসি ও সিএনজি বাস নয়।</strong> এসি বাসের ভাড়া সরকার ঠিক করে না, মালিক ঠিক
              করে। আর এই হার কারণ সাধারণ ডিজেল বাসের জন্য; সিএনজি বাসে চলে না। আমাদের কাছে
              অনেক বাসের এসি/সিএনজি তথ্য নেই, তাই কিছু বাসের হিসাব ভুল হতে পারে।{' '}
              <span className="text-gray-600 dark:text-gray-400">
                AC and CNG buses are priced outside this rate, and we often cannot tell which a
                given bus is.
              </span>
            </li>
            <li>
              • <strong>সিটিং সার্ভিস বাদে।</strong> {c.busesPremiumService} টি সিটিং সার্ভিস বাসের
              ভাড়া আলাদা, তাই ওগুলোর জন্য হিসাব দেখানো হয় না।{' '}
              <span className="text-gray-600 dark:text-gray-400">
                {c.busesPremiumService} premium sitting-service buses are excluded.
              </span>
            </li>
            <li>
              • <strong>প্রতিটি পথের দূরত্ব নেই।</strong> {c.stopsWithDistance}/{c.stops} টি থামার
              দূরত্ব আমাদের কাছে আছে। যেসব পথের একটি থামাও বাদ পড়ে, সেখানে ভাড়া হিসাব করা হয় না —
              আংশিক দূরত্ব দিয়ে হিসাব করলে ভাড়া কম দেখাত, যা ভুল।{' '}
              <span className="text-gray-600 dark:text-gray-400">
                Distances are known for {c.stopsWithDistance} of {c.stops} stops. Trips with any
                unmeasured leg are not priced at all, because a partial distance would understate
                the fare.
              </span>
            </li>
          </ul>
        </div>

        <h3 className="mt-6 text-sm font-semibold">যেখান থেকে হারটি নেওয়া হয়েছে / Where the rate comes from</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {policy.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                {s.publisher}
              </a>
              <span className="text-gray-600 dark:text-gray-400"> — {s.title}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          দূরত্বের তথ্য এসেছে অক্রিয় প্রজেক্ট{' '}
          <a
            href="https://github.com/thekhairul/citybusbd"
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            citybusbd
          </a>{' '}
          থেকে (Google Directions distance matrix)। সেই প্রজেক্টটি আর চালু নেই, তাই আমরা নিজের
          কপি রিপোজিটরিতে রেখেছি।
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">রাইডারদের জানানো ভাড়া / Fares riders reported</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          যারা বাস চেপে নিজে টাকা দিয়েছেন, তারা সেটি জানাতে পারেন। খবর বা সোশ্যাল মিডিয়ায় দেখা
          তথ্যের জন্য লিংক দেওয়া বাধ্যতামূলক, যাতে পরে যাচাই করা যায়। জানানো ভাড়া কখনোই
          &ldquo;ভাড়া&rdquo; হিসেবে দেখানো হয় না — কতজন মানুষ একই কথা বলছে তার সাথে সবার মধ্যে
          মাঝের হিসাব দেখানো হয়।
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Anyone who has actually paid can report it. Claims from news or social media require a
          link so they can be checked later. A reported fare is never published as{' '}
          <em>the</em> fare — only the median of what riders said, with the count attached.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">বাসের ছবি / Bus photos</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          মূল তথ্যে ১৫৬ টি বাসের ছবির ঠিকানা ছিল, কিন্তু সবগুলো একই Firebase স্টোরেজে ছিল।
          Google পরে ওই প্রজেক্টটি বন্ধ করে দেয়, তাই {c.buses} টি ছবির একটিও আর কাজ করে না (HTTP
          402)। ভাঙা ছবি দেখানোর চেয়ে বাস নম্বর দিয়ে তৈরি চিহ্ন বেশি কাজে লাগে, তাই সেটাই দেখানো
          হয়েছে।
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          The source had a photo for every bus, all in one Firebase bucket. Google switched that
          project off, so all {c.buses} URLs now return HTTP 402 and none of the images resolve. A
          route-number badge is more use at a terminal than a broken photo, so that is what is
          shown.
        </p>
      </section>


      <section className="mt-10">
        <h2 className="text-lg font-semibold">রুট তথ্য কোথা থেকে এসেছে</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          রুট তথ্য আসে{' '}
          <a
            href="https://github.com/imamhossain94/dhaka-city-local-bus-json-data"
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            rel="noreferrer noopener"
            target="_blank"
          >
            dhaka-city-local-bus-json-data
          </a>{' '}
          থেকে, যা ২০২৪ সালে busroutebd.com থেকে সংগৃহীত। মূল সাইটটি আর চালু নেই, তাই ওই ফাইলটিই এখন
          একমাত্র উপলব্ধ কপি এবং আমরা সেটি রিপোজিটরিতে রেখে দিয়েছি।
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          That data was scraped from busroutebd.com in 2024. That site is now offline, so this
          repository holds the only surviving copy we know of. Route data may well be out of date.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">ভাড়ার তালিকা / The official fare chart</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          BRTA প্রতিটি রুটের ভাড়ার একটি তালিকাও প্রকাশ করে, কিন্তু সেটি একটি স্ক্যান করা PDF
          (১১৬ পৃষ্ঠা) যাতে লেখার স্তর নেই। তাই সেটি পড়া স্বয়ংক্রিয়ভাবে সম্ভব নয়। ওই তালিকা থেকে
          কেউ হাতে লিখে <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">data/overrides/fares.json</code>{' '}
          এ যোগ করলে সেই বাসের ভাড়া &ldquo;যাচাই করা&rdquo; হিসেবে দেখানো হবে, আর আনুমানিক নয়।
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          BRTA also publishes a per-route fare chart, but it is a scanned PDF (116 pages) with no
          text layer, so it cannot be read automatically. When a person transcribes a bus from it
          into <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">fares.json</code> that bus
          gets a real fare shown instead of an estimate.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">বানানের সমস্যা ও সংশোধন</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          মূল তথ্যে {c.rawStopSpellings} টি আলাদা বানান ছিল, যার মধ্যে {c.spellingsMerged} টি একই
          জায়গার ভুল বানান ছিল। যেমন &ldquo;Kuril Bissho Road&rdquo; ও &ldquo;Kuril Bishwa
          Road&rdquo;। এগুলো একই আইডিতে মিলিয়ে দেওয়া হয়েছে যাতে খোঁজার সময় যেকোনো বানান কাজ করে।
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          The source data had {c.rawStopSpellings} different spellings for what turned out to be{' '}
          {c.stops} places. {c.spellingsMerged} of those were misspellings of the same place, such as
          &ldquo;Kuril Bissho Road&rdquo; versus &ldquo;Kuril Bishwa Road&rdquo;. They are merged
          onto one id so search works whichever way you spell it.
        </p>

        {mergedPairs.length > 0 && (
          <details className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/50">
            <summary className="cursor-pointer text-sm font-semibold">
              {mergedPairs.length} টি মিলিয়ে দেওয়া বানান দেখুন / See the{' '}
              {mergedPairs.length} merged spellings
            </summary>
            <ul className="mt-3 space-y-2 text-xs text-gray-600 dark:text-gray-400">
              {mergedPairs.map((w) => (
                <li key={w.id}>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{w.id}</span>:{' '}
                  {w.spellings?.join(' · ')}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Unresolved judgement calls. These change results, so they are shown
            rather than quietly patched. */}
        {suspects.length > 0 && (
          <div className="mt-4 rounded-xl border border-fare-500/30 bg-fare-500/5 p-4 dark:border-fare-600/30 dark:bg-fare-600/10">
            <p className="text-sm font-semibold text-fare-600 dark:text-fare-500">
              যাচাই করা দরকার / Needs a human decision
            </p>
            <ul className="mt-2 space-y-3">
              {suspects.map((w) => (
                <li key={w.id} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">{w.id}</span>
                  <span className="mt-1 block text-gray-600 dark:text-gray-400">{w.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">যা আমরা জানি না / What we do not have</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>• রাস্তার কোন দিকে দাঁড়াতে হবে — কোন বাসের কোন পাশে ওঠতে হয়, সেটা আমরা জানি না।</li>
          <li>• Where exactly to stand. We cannot tell you which side of the road to wait on.</li>
          <li>• ট্রাফিকের প্রকৃত সময়। কম স্টপ মানে দ্রুত যাত্রা, কিন্তু আমরা সময়ের দাবি করি না।</li>
          <li>• Live timings. Fewer stops is a proxy for a faster ride, not a timetable.</li>
          <li>• ট্রানজিফার। এখনো সরাসরি বাসই দেখানো হয়।।</li>
          <li>• Transfers. Only direct buses are shown.</li>
        </ul>
      </section>
    </div>
  );
}
