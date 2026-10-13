'use client';

import { useState } from 'react';
import { MdContentCopy, MdDone, MdMap, MdMyLocation } from 'react-icons/md';
import { useLang } from '@/Utils/LangContext';
import {
  googleMapsCoordsUrl,
  googleMapsDirUrl,
  googleMapsSearchUrl,
  stopQuery,
} from '@/Utils/maps';

type Props = {
  boardingEn: string;
  alightingEn: string;
};

/**
 * Google Maps links for a bus result + the passenger's own position.
 *
 * Two jobs in one place on purpose:
 * 1. The bus: directions + each end as a search, built from stop NAMES so it
 *    works even though the dataset has no coordinates.
 * 2. The passenger: an opt-in "where am I" GPS fix with an "open in Google
 *    Maps" link and a copy button, so a rider can share it with whoever is
 *    picking them up.
 */
export default function GoogleMapsLinks({ boardingEn, alightingEn }: Props) {
  const { t } = useLang();
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [copied, setCopied] = useState(false);

  const boardingQuery = stopQuery(boardingEn);
  const alightingQuery = stopQuery(alightingEn);
  const routeUrl = googleMapsDirUrl(boardingQuery, alightingQuery);
  const boardingUrl = googleMapsSearchUrl(boardingQuery);
  const alightingUrl = googleMapsSearchUrl(alightingQuery);

  const findMe = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocError(true);
      return;
    }
    setLocating(true);
    setLocError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError(true);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  const copyLoc = async () => {
    if (!loc) return;
    try {
      await navigator.clipboard.writeText(googleMapsCoordsUrl(loc.lat, loc.lng));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setLocError(true);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-[#1a73e8] shadow-sm ring-1 ring-inset ring-[#dadce0] transition-colors hover:bg-[#f1f3f4] dark:bg-gray-900 dark:text-[#8ab4f8] dark:ring-gray-700 dark:hover:bg-gray-800"
        >
          <MdMap className="text-sm" />
          {t('গুগল ম্যাপে পথ দেখুন', 'Open route in Google Maps')}
        </a>
        <a
          href={boardingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
        >
          {t('ওঠার জায়গা', 'Boarding stop')}
        </a>
        <a
          href={alightingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
        >
          {t('নামার জায়গা', 'Getting off')}
        </a>
        <button
          type="button"
          onClick={findMe}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
        >
          <MdMyLocation className="text-sm" />
          {locating
            ? t('খুঁজছি…', 'Locating…')
            : loc
              ? t('আবার খুঁজুন', 'Refresh my location')
              : t('আমি কোথায়?', 'Where am I?')}
        </button>
      </div>

      {loc && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a
            href={googleMapsCoordsUrl(loc.lat, loc.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
          >
            <MdMap className="text-sm" />
            {t('আমার অবস্থান ম্যাপে দেখুন', 'Open my location in Maps')}
          </a>
          <button
            type="button"
            onClick={copyLoc}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
          >
            {copied ? <MdDone className="text-sm" /> : <MdContentCopy className="text-sm" />}
            {copied ? t('কপি হয়েছে', 'Copied') : t('লিংক কপি', 'Copy link')}
          </button>
          <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
            {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
          </span>
        </div>
      )}

      {locError && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          {t(
            'অবস্থান পাওয়া যায়নি। ব্রাউজারে লোকেশন অনুমতি দিন।',
            'Could not get your location. Allow location permission in the browser.'
          )}
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
        {t(
          'নামের ভিত্তিতে খোঁজা — বাস ঠিক কোথায় থামে তা আমরা জানি না, সঠিক রাস্তা গুগল ম্যাপে দেখুন।',
          'Name-based search — we do not know the exact halt point, check the real road on Google Maps.'
        )}
      </p>
    </div>
  );
}
