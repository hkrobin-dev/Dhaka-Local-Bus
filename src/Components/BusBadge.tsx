'use client';

/**
 * Stand-in for a bus photo.
 *
 * The source dataset had a photo for all 156 buses, every one of them pointing
 * at a single Firebase bucket that Google has since switched off. So there is no
 * photo to show, and showing a broken image 156 times would be worse than
 * showing nothing.
 *
 * What actually identifies a bus to a rider is its number and its name, so the
 * badge is built from those. "4 No.", "7 No." and "Ekattor" all read at a glance
 * from across a terminal, which is more use than a stock photo would be.
 */

const NUMERIC = /(\d+)\s*(?:no\.?|নং|নংয়)/i;

/** A deterministic hue per bus, so the same bus is always the same colour. */
function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}

export default function BusBadge({
  nameEn,
  nameBn,
  size = 'md',
}: {
  nameEn: string;
  nameBn: string | null;
  size?: 'md' | 'lg';
}) {
  // Prefer a real route number. Fall back to the first word of the name.
  const numeric = nameEn.match(NUMERIC)?.[1];
  const label = numeric
    ? nameEn.match(NUMERIC)![0].replace(/\s*(no\.?|নং)$/i, '')
    : (nameBn ?? nameEn).split(/\s+/)[0]?.slice(0, 4);

  const hue = hueFor(nameEn);
  const big = size === 'lg';

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl font-bold leading-none ${
        big ? 'size-16 text-lg' : 'size-14 text-base'
      }`}
      style={{
        // oklch keeps these perceptually similar at any lightness, so no badge
        // ends up unreadable against the light card.
        backgroundColor: `oklch(0.94 0.045 ${hue})`,
        color: `oklch(0.42 0.11 ${hue})`,
      }}
    >
      <span className="max-w-full truncate px-1">{label || '?'}</span>
    </span>
  );
}
