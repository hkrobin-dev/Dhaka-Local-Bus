/**
 * Which stop the rider is searching for.
 *
 * Lives above the components so the "from" field and the "to" field cannot
 * disagree about what has been picked, and so the two autocomplete dropdowns
 * stay in sync while typing.
 */

'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Stop } from '@/types/transit';

type SearchSide = 'from' | 'to';

type StopSearchContextValue = {
  /** Stop chosen for the 'from' field, or null. */
  from: Stop | null;
  /** Stop chosen for the 'to' field, or null. */
  to: Stop | null;
  setStop: (side: SearchSide, stop: Stop | null) => void;
  /** Swap the two endpoints. People change their mind about direction. */
  swap: () => void;
  reset: () => void;
  /** True when both endpoints are set, i.e. a search can actually run. */
  ready: boolean;
};

const StopSearchContext = createContext<StopSearchContextValue | null>(null);

export function StopSearchProvider({ children }: { children: React.ReactNode }) {
  const [from, setFrom] = useState<Stop | null>(null);
  const [to, setTo] = useState<Stop | null>(null);

  const setStop = useCallback((side: SearchSide, stop: Stop | null) => {
    if (side === 'from') setFrom(stop);
    else setTo(stop);
  }, []);

  const swap = useCallback(() => {
    setFrom((oldFrom) => {
      setTo(oldFrom);
      return to;
    });
  }, [to]);

  const reset = useCallback(() => {
    setFrom(null);
    setTo(null);
  }, []);

  const value = useMemo(
    () => ({
      from,
      to,
      setStop,
      swap,
      reset,
      ready: Boolean(from && to && from.id !== to.id),
    }),
    [from, to, setStop, swap, reset]
  );

  return <StopSearchContext.Provider value={value}>{children}</StopSearchContext.Provider>;
}

export function useStopSearch() {
  const ctx = useContext(StopSearchContext);
  if (!ctx) {
    throw new Error('useStopSearch must be used inside StopSearchProvider');
  }
  return ctx;
}
