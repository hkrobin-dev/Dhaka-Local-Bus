'use client';

/**
 * The real map: this bus's route drawn on an actual map of Dhaka.
 *
 * WHAT THIS SHOWS, PRECISELY
 *
 * Stop positions come from `scripts/fetch-coordinates.mjs`, which geocodes stop
 * NAMES via OpenStreetMap Nominatim. A hit means OSM knows a place of that name
 * in greater Dhaka. It does NOT mean the bus stops at that exact point: these
 * are neighbourhood-level pins, not surveyed stop locations. The label on the
 * map says so, in the open, because a rider standing at a terminal would
 * otherwise reasonably assume the pin is the actual stop.
 *
 * The straight line between two pins is NOT the road the bus drives. Real road
 * geometry does not exist in this project. The line answers "which order does
 * this bus visit these places in", and the app says so directly beneath it.
 *
 * A journey is only drawn on the real map when EVERY stop on it has a
 * coordinate. One missing pin and the whole thing falls back to the schematic,
 * because half a real map and half an invented one would misrepresent the route.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MdPlace } from 'react-icons/md';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getStop, isJourneyPlottable, routeLegs, type Journey } from '@/Utils/transit';
import { useLang } from '@/Utils/LangContext';

/**
 * Leaflet is imported dynamically rather than at the top of the file.
 *
 * Leaflet reads `window` while its module body evaluates, so a static import
 * crashes the server render with "window is not defined" before any component
 * renders. Loading it inside an effect keeps it on the client where it belongs.
 * The type-only import above is erased at compile time and is safe.
 */
type LeafletModule = typeof Leaflet;

/**
 * A Google Maps link for one pin.
 *
 * Coordinate form, not a text search: our pin is a known point, and searching
 * by name risks landing on a different place that happens to share the name.
 * The zoom is set high because the pin is the point being shown.
 */
function googleMapsUrl(lat: number, lng: number, label: string) {
  const q = `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}&query_place_id=${encodeURIComponent(label)}`;
}

/**
 * Directions through the whole route on Google Maps.
 *
 * The intermediate stops are passed as a waypoint so Google shows the same order
 * this bus runs, rather than its own idea of the fastest path between the two
 * ends. travelmode=transit because this is a bus route: Google will switch to
 * its own transit directions where it has them, which is real timetable data we
 * do not have, and falls back to driving where it does not.
 */
function googleMapsRouteUrl(
  stops: { lat: number; lng: number; label: string }[]
) {
  const first = stops[0];
  const last = stops[stops.length - 1];
  // Waypoints are capped: Google rejects very long ones, and a 40-stop route is
  // not something a rider is following end to end anyway.
  const via = stops
    .slice(1, -1)
    .slice(0, 8)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|');

  const params = new URLSearchParams({
    api: '1',
    origin: `${first.lat},${first.lng}`,
    destination: `${last.lat},${last.lng}`,
    travelmode: 'transit',
  });
  if (via) params.set('waypoints', via);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Escape text going into a Leaflet popup, which is built as raw HTML. */
function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Leaflet's default marker images resolve relative to the CSS, which breaks
 * under bundlers. A plain divIcon avoids shipping image assets at all.
 */
function pinIcon(L: LeafletModule, kind: 'start' | 'end' | 'stop', label: string) {
  const colour =
    kind === 'start' ? '#15803d' : kind === 'end' ? '#e11d48' : '#0f766e';
  const ring = kind === 'stop' ? '#ffffff' : colour;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:26px;border-radius:9999px;
      background:${colour};border:3px solid ${ring};
      box-shadow:0 1px 4px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font:700 11px/1 system-ui,sans-serif;">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function RouteMap({ journey }: { journey: Journey }) {
  const { t, stopName } = useLang();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // User location: opt-in only, explicitly disclaimed.
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const userIsSet = userPos != null;
  const userLat = userPos?.lat ?? null;
  const userLng = userPos?.lng ?? null;

  const stopsBetween = journey.stopsBetween;
  const plottable = useMemo(
    () => isJourneyPlottable(stopsBetween),
    [stopsBetween]
  );

  const points = useMemo(
    () =>
      stopsBetween
        .map((id) => getStop(id))
        .filter((s): s is NonNullable<typeof s> => s != null && s.lat != null && s.lng != null)
        .map((s) => [s.lat as number, s.lng as number] as [number, number]),
    [stopsBetween]
  );

  const legs = useMemo(() => routeLegs(stopsBetween), [stopsBetween]);
  const measuredLegs = legs.filter((l) => l.metres != null);

  const weights = useMemo(() => {
    if (!legs.length) return [];
    const mean =
      measuredLegs.length > 0
        ? measuredLegs.reduce((s, l) => s + (l.metres ?? 0), 0) / measuredLegs.length
        : 1;
    return legs.map((l) => (l.metres != null ? Math.max(l.metres, 1) : Math.max(mean, 1)));
  }, [legs, measuredLegs]);

  const totalSeconds = Math.max(2.2, legs.length * 1.1);

  // -------------------------------------------------------------- the map

  useEffect(() => {
    if (!plottable || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    import('leaflet')
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        const L = (mod.default ?? mod) as LeafletModule;
        leafletRef.current = L;
        const map = L.map(containerRef.current, {
          zoomControl: false, attributionControl: true, scrollWheelZoom: false,
        });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, minZoom: 10, attribution: '© OpenStreetMap',
        }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        if (userIsSet && userLat != null && userLng != null) {
          L.marker([userLat, userLng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:30px;height:30px;border-radius:9999px;background:#ff6b6b;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px/1 system-ui,sans-serif;">📍</div>`,
              iconSize: [30, 30], iconAnchor: [15, 15],
            }),
            title: 'Your position (rough area)',
          }).addTo(map);
          map.fitBounds(L.latLngBounds([[userLat - 0.01, userLng - 0.01], [userLat + 0.01, userLng + 0.01]]), { padding: [40, 40] });
        }
      })
      .catch((err) => { if (!cancelled) setLoadError(String(err?.message ?? err)); });

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; markerRef.current = null; }
    };
  }, [plottable, userIsSet, userLat, userLng]);

  // Initialize user position from localStorage.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('findup-user-location');
      if (stored) {
        const data = JSON.parse(stored);
        requestAnimationFrame(() => setUserPos({ lat: data.lat, lng: data.lng }));
      }
    } catch (_) {}
  }, []);

  // Request geolocation (opt-in).
  useEffect(() => {
    if (typeof window === 'undefined' || userIsSet) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        try { localStorage.setItem('findup-user-location', JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })); } catch (_) {} },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
    );
  }, [userIsSet]);

  // Redraw the route whenever the journey changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const L = leafletRef.current;
    if (!map || !layer || !L || !plottable || points.length < 2) return;

    layer.clearLayers();
    markerRef.current = null;

    // The straight line between pins, which is the honest version of this shape:
    // order, not roads.
    L.polyline(points, {
      color: '#0f766e',
      weight: 4,
      opacity: 0.85,
      lineJoin: 'round',
    }).addTo(layer);

    points.forEach(([lat, lng], i) => {
      const kind = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'stop';
      const stop = getStop(stopsBetween[i]);
      const label = stop ? stop.nameEn || stop.id : stopsBetween[i];

      // The popup escapes the name and builds a real link, because a stop name
      // is user-supplied text and goes straight into innerHTML otherwise.
      const escaped = escapeHtml(stop ? stopName(stop) : stopsBetween[i]);
      const bn = stop?.nameBn ? `<br/><span style="color:#666">${escapeHtml(stop.nameBn)}</span>` : '';
      const gmap =
        `<a href="${escapeHtml(googleMapsUrl(lat, lng, label))}"` +
        ` target="_blank" rel="noopener noreferrer"` +
        ` style="display:inline-block;margin-top:6px;font:500 12px/1 system-ui,sans-serif;color:#1a73e8">` +
        `Google Maps-এ খুলুন →</a>`;

      L.marker([lat, lng], {
        icon: pinIcon(L, kind, i === 0 ? 'A' : i === points.length - 1 ? 'B' : String(i)),
        keyboard: false,
        title: escaped,
      })
        .bindPopup(
          `<strong>${escaped}</strong>${bn}${gmap}`,
          { maxWidth: 240 }
        )
        .addTo(layer);
    });

    // The bus marker starts at the boarding pin and is animated below.
    markerRef.current = L.marker(points[0], {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:#0f766e;border:3px solid #fff;box-shadow:0 0 0 6px rgba(15,118,110,.25)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      zIndexOffset: 500,
      keyboard: false,
    }).addTo(layer);

    map.fitBounds(L.latLngBounds(points), { padding: [26, 26] });

    return () => {
      layer.clearLayers();
    };
  }, [plottable, points, stopsBetween, stopName]);

  // --------------------------------------------------------- the animation

  useEffect(() => {
    if (!playing) return;
    let raf: number | null = null;
    const start = performance.now();
    const from = progress;

    const step = (now: number) => {
      const next = Math.min(
        1,
        Math.max(0, from + Math.max(0, now - start) / (totalSeconds * 1000))
      );
      setProgress(next);
      if (next >= 1) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
    // progress is the animated value; depending on it would restart every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalSeconds]);

  // Move the bus pin along the route, weighted by real leg distance.
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !plottable || points.length < 2 || !weights.length) return;

    const safe = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    const weightTotal = weights.reduce((a, b) => a + b, 0);

    // Which leg are we on, by weighted distance travelled.
    let acc = 0;
    let leg = 0;
    let intoLeg = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weightTotal > 0 ? weights[i] / weightTotal : 1 / Math.max(weights.length, 1);
      if (safe <= acc + w || i === weights.length - 1) {
        leg = i;
        intoLeg = w === 0 ? 0 : Math.min(1, Math.max(0, (safe - acc) / w));
        break;
      }
      acc += w;
    }

    const a = points[leg];
    const b = points[Math.min(points.length - 1, leg + 1)];
    if (a && b) {
      marker.setLatLng([a[0] + (b[0] - a[0]) * intoLeg, a[1] + (b[1] - a[1]) * intoLeg]);
    }
  }, [progress, points, weights, plottable]);

  if (loadError) {
    return (
      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        {t('মানচিত্র লোড করা যায়নি।', 'The map could not be loaded.')}
      </p>
    );
  }

  if (!plottable) {
    return (
      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        {t(
          'এই পথের কিছু স্টপের অবস্থান আমরা জানি না, তাই এটি মানচিত্রে দেখানো যাচ্ছে না।',
          'We do not have a position for some stops on this route, so it cannot be shown on the map.'
        )}
      </p>
    );
  }

  const totalMetres = measuredLegs.reduce((s, l) => s + (l.metres ?? 0), 0);
  const coverage = Math.round((measuredLegs.length / Math.max(legs.length, 1)) * 100);

  // How close the pins are to each other, as a straight-line distance. Worth
  // showing because it is the honest scale of what the pins mean: if the route
  // spans 6km in a straight line, the pins are telling you the rough corridor
  // and nothing finer. Hidden if it is tiny, because then the detail is close.
  let spanKm: number | null = null;
  if (points.length >= 2) {
    const R = 6371;
    const rad = (d: number) => (d * Math.PI) / 180;
    const hav = (a: [number, number], b: [number, number]) => {
      const dLat = rad(b[0] - a[0]);
      const dLon = rad(b[1] - a[1]);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    };
    spanKm = hav(points[0], points[points.length - 1]);
  }

  // Google Maps links, built from the same pins the map is showing.
  const googleRoute = googleMapsRouteUrl(
    stopsBetween
      .map((id) => getStop(id))
      .filter((s): s is NonNullable<typeof s> => s != null && s.lat != null && s.lng != null)
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number, label: s.nameEn || s.id }))
  );
  const googleFirst = points[0]
    ? googleMapsUrl(points[0][0], points[0][1], getStop(stopsBetween[0])?.nameEn ?? stopsBetween[0])
    : null;
  const googleLastStopId = stopsBetween[stopsBetween.length - 1];
  const googleLast = points[points.length - 1]
    ? googleMapsUrl(
        points[points.length - 1][0],
        points[points.length - 1][1],
        getStop(googleLastStopId)?.nameEn ?? googleLastStopId
      )
    : null;

  return (
      <div className="mt-3">
        <div
          ref={containerRef}
          className="h-64 w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
          aria-label={t('পথের মানচিত্র', 'Map of the route')}
        />

        {/* User location (opt-in, rough area only). */}
        {userIsSet && userLat != null && userLng != null && (
                <p className="mt-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                  {t(
                    'আপনার অবস্থানShown (rough area only; actual bus stops may differ).',
                    'Your position is shown as a rough area only; actual bus stops may differ.'
                  )}
                </p>
              )}

              {/* Say what the pins and the line are. Straight after the map, not hidden. */}
              <p className="mt-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                {t(
                  'পিনগুলো স্টপের এলাকা দেখায়, ঠিকানা নয় — ওই নামের জায়গা OSM-এ পাওয়া গেছে। বাস ঠিক কোথাও থামে তা আমরা জানি না।',
                  'Pins show the area of each stop, not the exact spot: they are places Nominatim found under that name. We do not know where the bus actually halts.'
                )}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                {t(
                  'দুই পিনের মাঝের সরু রেখা রাস্তা নয়, শুধু বাস কোন ক্রমে যায় তা দেখায়। সঠিক রাস্তা ও দিক দেখতে গুগল ম্যাপে যান।',
                  'The straight line between pins is not the road, only the order the bus visits them. For the real road, open Google Maps.'
                )}
                {userIsSet && userLat != null && userLng != null && (
                  ' ' + t(
                    'আপনারshown position is also arough area only; it does not correspond to any bus stop.',
                    'Your shown position is also a rough area; it does not correspond to any bus stop.'
                  )
                )}
              </p>
        {spanKm != null && spanKm > 0.9 && (
          <>
            {' '}
            {t(
              `পিনগুলো ${spanKm.toFixed(1)} কিলোমিটারের কর্ণও দেখায়, তাই এটি মোটামুটি কর্ণ, সঠিক রাস্তা নয়।`,
              `The pins span a ${spanKm.toFixed(1)}km straight line, so this is the rough corridor, not the road.`
            )}
          </>
        )}

      {/* Hand off to a real map. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={googleRoute}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-[#1a73e8] shadow-sm ring-1 ring-inset ring-[#dadce0] transition-colors hover:bg-[#f1f3f4] dark:bg-gray-900 dark:text-[#8ab4f8] dark:ring-gray-700 dark:hover:bg-gray-800"
        >
          <MdPlace className="text-sm" />
          {t('গুগল ম্যাপে পথ দেখুন', 'Open in Google Maps')}
        </a>
        {googleFirst && (
          <a
            href={googleFirst}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
          >
            {t('ওঠার জায়গা', 'Boarding stop')}
          </a>
        )}
        {googleLast && (
          <a
            href={googleLast}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
          >
            {t('নামবেন', 'Getting off')}
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            if (playing) { setPlaying(false); return; }
            if (progress >= 1) setProgress(0);
            setPlaying(true);
          }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
        >
          {playing ? t('থামান', 'Pause') : progress > 0 && progress < 1 ? t('চালু করুন', 'Resume') : t('গাড়ি চালান', 'Run the bus')}
        </button>
        <button
          type="button"
          onClick={() => { setProgress(0); setPlaying(true); }}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400"
        >
          {t('আবার', 'Replay')}
        </button>
        {journey.distanceMetres != null && (
          <span className="ml-auto text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
            {(journey.distanceMetres / 1000).toFixed(1)} km
          </span>
        )}
      </div>

      <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
        {t(
          `দূরত্ব মাপা আছে ${coverage}% লেগে। বাকিগুলোর জন্য গাড়ির গতি সাধারণ গতিতে দেখানো হচ্ছে।`,
          `Distance is measured on ${coverage}% of legs. The bus moves at an average pace on the rest.`
        )}
        {totalMetres > 0 && (
          <>
            {' '}
            {t('জানা দূরত্ব', 'Known distance')}: {(totalMetres / 1000).toFixed(1)} km
          </>
        )}
      </p>
    </div>
  );
}