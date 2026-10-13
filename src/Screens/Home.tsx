'use client';

import { motion } from 'motion/react';
import { MdDirectionsBus, MdPayments, MdRoute } from 'react-icons/md';
import SearchForm from '@/Components/SearchForm';
import { useLang } from '@/Utils/LangContext';

const FEATURES = [
  {
    icon: MdDirectionsBus,
    bn: { title: 'কোন বাস যায়', body: 'দুটো জায়গা বেছে নিন, সরাসরি যাওয়া বাসগুলো দেখুন।' },
    en: { title: 'Which bus goes', body: 'Pick two places and see every bus that passes both.' },
  },
  {
    icon: MdPayments,
    bn: { title: 'ভাড়া আগেই জানুন', body: 'যাচাই করা ভাড়া দেখানো হয়। যা নিশ্চিত নয়, তা বানিয়ে বলা হয় না।' },
    en: { title: 'Know the fare first', body: 'We show fares we have verified. Where we are unsure, we say so instead of guessing.' },
  },
  {
    icon: MdRoute,
    bn: { title: 'বানান ভুলেও খুঁজুন', body: 'কুড়িল বিশ্বরোড বা কুড়িল বিশ্ব রোড — দুটোই কাজ করে।' },
    en: { title: 'Find it even with a typo', body: 'Search works whether you type "Kuril Bishwa Road" or "Kuril Bissho Road".' },
  },
] as const;

export default function Home() {
  const { lang } = useLang();

  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="pt-10 pb-8 sm:pt-16 sm:pb-10">
        {/* Staggered entrance. Small delay per element so it reads as one
            motion rather than three separate pops. */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950/60 dark:text-brand-300"
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-brand-500" />
          </span>
          {lang === 'bn' ? 'ঢাকা মেট্রো এলাকা' : 'Dhaka metro area'}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl"
        >
          {lang === 'bn' ? (
            <>
              কোন বাস কোথায় যায়,{' '}
              <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent dark:from-brand-400 dark:to-brand-300">
                ভাড়াসহ
              </span>
            </>
          ) : (
            <>
              Which bus goes where,{' '}
              <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent dark:from-brand-400 dark:to-brand-300">
                and what it costs
              </span>
            </>
          )}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-gray-600 dark:text-gray-300"
        >
          {lang === 'bn'
            ? 'স্ট্যান্ডে দাঁড়িয়ে ২০ জনকে একই প্রশ্ন করার দরকার নেই। যেখান থেকে কোথায় যেতে চান বলুন, সরাসরি যাওয়া বাস ও ভাড়া দেখুন।'
            : 'No need to ask the same twenty people at the terminal. Tell us where you are going and see the buses that go there, with the fare.'}
        </motion.p>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900/60"
      >
        <SearchForm />
      </motion.section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {FEATURES.map((feature, i) => {
          const copy = feature[lang];
          return (
            <motion.article
              key={feature.en.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.26 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/40"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/70 dark:text-brand-300">
                <feature.icon className="text-xl" />
              </span>
              <h2 className="mt-3.5 text-[15px] font-semibold">{copy.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {copy.body}
              </p>
            </motion.article>
          );
        })}
      </section>
    </div>
  );
}
