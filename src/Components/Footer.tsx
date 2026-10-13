'use client';

import Link from 'next/link';
import { MdInfo } from 'react-icons/md';
import { useLang } from '@/Utils/LangContext';
import { DATA_CAVEAT } from '@/Utils/constants';

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('ঢাকা লোকাল বাস তথ্য', 'Dhaka Local Bus data')}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              {t(DATA_CAVEAT.bn, DATA_CAVEAT.en)}
            </p>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            <Link
              href="/data"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <MdInfo className="text-sm" />
              {t('তথ্যের উৎস', 'Data sources')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
