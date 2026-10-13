/**
 * Language. Bangla is the default because that is what riders use, with an
 * English toggle for anyone more comfortable with it.
 *
 * The dataset stores both names where they are known, so switching language
 * never means re-fetching. For the 126 stops that have no Bangla name yet the
 * UI falls back to English rather than showing a blank.
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Bus, Stop } from '@/types/transit';

export type Lang = 'bn' | 'en';

type LangContextValue = {
  lang: Lang;
  toggle: () => void;
  /** Name to show for a stop, falling back to English when Bangla is missing. */
  stopName: (stop: Stop) => string;
  /** Name to show for a bus. */
  busName: (bus: Bus) => string;
  t: (bn: string, en: string) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

const STORAGE_KEY = 'dhaka-bus-lang';

export function LangProvider({ children }: { children: React.ReactNode }) {
  /*
    Server and first client render are always Bangla, so hydration matches.
    The stored choice is applied in an effect after mount: English users see
    one update instead of a hydration-mismatch error. Reading localStorage in
    the lazy initialiser was the mismatch — SSR HTML is always 'bn' while the
    client's first render was already 'en'.
  */
  const [lang, setLang] = useState<Lang>('bn');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'bn' || stored === 'en') setLang(stored);
    } catch {
      // Private browsing can throw. Bangla default stands.
    }
  }, []);

  const toggle = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'bn' ? 'en' : 'bn';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      toggle,
      stopName: (stop) => {
        if (lang === 'bn' && stop.nameBn) return stop.nameBn;
        return stop.nameEn;
      },
      busName: (bus) => {
        if (lang === 'bn' && bus.nameBn) return bus.nameBn;
        return bus.nameEn;
      },
      t: (bn, en) => (lang === 'bn' ? bn : en),
    }),
    [lang, toggle]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}
