'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { MdDirectionsBusFilled, MdLanguage, MdDarkMode, MdLightMode } from 'react-icons/md';
import { useTheme } from '@/Utils/ThemeContext';
import { useLang } from '@/Utils/LangContext';

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { toggle, t } = useLang();
  const pathname = usePathname();
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-lg dark:border-gray-800 dark:bg-gray-950/80">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <motion.span
            whileHover={{ rotate: -8, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/25"
          >
            <MdDirectionsBusFilled className="text-xl" />
          </motion.span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight">ঢাকা লোকাল বাস</span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Dhaka Local Bus
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1.5">
          {pathname !== '/' && (
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:block dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              {t('খুঁজুন', 'Search')}
            </Link>
          )}

          <motion.button
            type="button"
            onClick={toggle}
            whileTap={{ scale: 0.9 }}
            aria-label={t('ভাষা পরিবর্তন করুন', 'Change language')}
            className="grid size-9 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <MdLanguage className="text-xl" />
          </motion.button>

          <motion.button
            type="button"
            onClick={toggleTheme}
            whileTap={{ scale: 0.9, rotate: 25 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            aria-label={isDark ? t('লাইট মোড', 'Light mode') : t('ডার্ক মোড', 'Dark mode')}
            className="relative grid size-9 place-items-center overflow-hidden rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            {/* Cross-fade plus a slow spin. Cheap, and it reads clearly. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? 'moon' : 'sun'}
                initial={{ y: isDark ? 14 : -14, opacity: 0, rotate: -35 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: isDark ? -14 : 14, opacity: 0, rotate: 35 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute grid place-items-center"
              >
                {isDark ? <MdDarkMode className="text-xl" /> : <MdLightMode className="text-xl" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </nav>
      </div>
    </header>
  );
}
