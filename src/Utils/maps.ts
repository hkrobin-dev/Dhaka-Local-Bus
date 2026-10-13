/**
 * Google Maps links that work without coordinates.
 *
 * The dataset has no lat/lng for any stop, so coordinate links cannot be
 * built. Name queries can: "Gabtoli, Dhaka, Bangladesh" lands on the right
 * place in Google Maps even though we do not know the exact halt point.
 */

/** A place search, e.g. a boarding stop. */
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** A coordinate pin, e.g. the passenger's own GPS fix. */
export function googleMapsCoordsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/**
 * Transit directions from one stop name to another.
 * travelmode=transit because this is a bus trip: Google shows its own
 * timetable where it has one, and falls back to driving where it does not.
 */
export function googleMapsDirUrl(origin: string, destination: string): string {
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'transit',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** "Mirpur 10" -> "Mirpur 10, Dhaka, Bangladesh", so the search stays in Dhaka. */
export function stopQuery(nameEn: string): string {
  const base = nameEn.trim();
  return /dhaka/i.test(base) ? base : `${base}, Dhaka, Bangladesh`;
}
