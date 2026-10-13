/**
 * Light/dark theme.
 *
 * Class based rather than media-query based, so the toggle wins over the OS
 * setting. The class goes on <html> and globals.css redefines Tailwind's dark
 * variant to key off it.
 *
 * The "no flash on reload" problem: React only runs after the page has already
 * painted, so a naive toggle makes the page flash white for a dark-mode user on
 * every load. A tiny inline script in <head> sets the class before first paint.
 * That script cannot be a React component, which is why it lives here as a raw
 * string.
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'dhaka-bus-theme';

/**
 * Runs before first paint, injected into <head>. Reads the stored choice,
 * falls back to the OS preference. Keep it dependency-free and small.
 */
export const themeInitScript = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    // Private browsing can throw on localStorage. Light mode is a safe default.
  }
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /*
    Server and first client render are always light, so hydration matches.
    The <head> inline script has already set the real class on <html>
    pre-paint; this state syncs to it in an effect. Reading the class in the
    lazy initialiser was the mismatch — SSR HTML is always light while the
    client's first render could already be dark.
  */
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      const root = document.documentElement;
      root.classList.toggle('dark', next === 'dark');
      // Tells the browser to style scrollbars and form controls to match.
      root.style.colorScheme = next;
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
