'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MdPlace, MdClose } from 'react-icons/md';
import { searchStops } from '@/Utils/transit';
import type { Stop } from '@/types/transit';
import { useStopSearch } from '@/Utils/StopSearchContext';
import { useLang } from '@/Utils/LangContext';

type Props = { side: 'from' | 'to' };

/**
 * One endpoint of the search. Typing filters the stop list live; picking an
 * option locks the field in.
 *
 * The filtering runs on the client because the whole dataset is already in
 * memory. A rider typing on 3G should see results appear as they type, with no
 * round trip and no spinner.
 */
export default function StopInput({ side }: Props) {
  const { from, to, setStop } = useStopSearch();
  const { stopName, lang, t } = useLang();

  /** The name in the other language, so a rider can confirm the right place. */
  const otherLanguageName = (stop: Stop) => {
    if (lang === 'bn') return stop.nameEn;
    return stop.nameBn ?? null;
  };

  const chosen = side === 'from' ? from : to;
  const other = side === 'from' ? to : from;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = `stop-listbox-${side}`;

  const results = useMemo(() => {
    // A chosen stop shows as a chip, not as filtered results.
    if (chosen) return [];
    return searchStops(query, 10);
  }, [query, chosen]);

  // Close when the rider clicks away. Pointer-down rather than click, so the
  // dropdown does not vanish before an option can register its own click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Reset the keyboard highlight as the query changes, in the same event that
  // changed the query. Doing it in an effect would be a second render pass and
  // would briefly show the highlight on the wrong row.
  function onQueryChange(value: string) {
    setQuery(value);
    setHighlighted(0);
    setOpen(true);
  }

  function choose(stop: Stop) {
    // Picking the stop the other field already holds would make a
    // from === to search that can never match.
    if (other?.id === stop.id) return;
    setStop(side, stop);
    setQuery('');
    setOpen(false);
  }

  function clear() {
    setStop(side, null);
    setQuery('');
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[highlighted]) {
        e.preventDefault();
        choose(results[highlighted]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const label = side === 'from' ? t('যেখান থেকে', 'From') : t('যেখানে যাবেন', 'To');
  const placeholder = side === 'from' ? t('যেমন: গাবতলী', 'e.g. Gabtoli') : t('যেমন: বনানী', 'e.g. Banani');

  return (
    <div ref={boxRef} className="relative flex-1">
      <label
        htmlFor={`stop-${side}`}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        {label}
      </label>

      <div className="relative">
        <MdPlace className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400 dark:text-gray-500" />

        <input
          ref={inputRef}
          id={`stop-${side}`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          value={chosen ? stopName(chosen) : query}
          placeholder={placeholder}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`w-full rounded-xl border bg-white py-3 pl-10 text-[15px] transition-all duration-200 outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 dark:bg-gray-900 dark:placeholder:text-gray-600 ${
            chosen
              ? 'border-brand-300 pr-10 font-medium dark:border-brand-800'
              : 'border-gray-300 pr-10 dark:border-gray-700'
          }`}
        />

        {chosen && (
          <motion.button
            type="button"
            onClick={clear}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileTap={{ scale: 0.85 }}
            aria-label={t('মুছুন', 'Clear')}
            className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <MdClose className="text-sm" />
          </motion.button>
        )}

        {/* Autocomplete */}
        <AnimatePresence>
          {open && results.length > 0 && (
            <motion.ul
              id={listboxId}
              role="listbox"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-0 top-full z-40 mt-2 max-h-72 origin-top overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/40"
            >
              {results.map((stop, i) => {
                const disabled = other?.id === stop.id;
                return (
                  <li key={stop.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlighted}
                      disabled={disabled}
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => choose(stop)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        disabled
                          ? 'cursor-not-allowed opacity-35'
                          : i === highlighted
                            ? 'bg-brand-50 dark:bg-brand-950/60'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium">
                          {stopName(stop)}
                        </span>
                        {/* Show the other language so a rider can confirm they
                            picked the right place, not just a similar one. */}
                        {otherLanguageName(stop) && (
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {otherLanguageName(stop)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
                        {stop.busCount} {t('বাস', 'buses')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
