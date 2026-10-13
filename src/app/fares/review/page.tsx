import type { Metadata } from 'next';
import { getPendingGroups, adminConfigured } from '@/Services/pendingFares';
import { readFaresFile } from '@/Services/fareOverrides';
import FareReview from '@/Screens/FareReview';

export const metadata: Metadata = {
  title: 'ভাড়া যাচাই | Fare review',
  description: 'Decide which rider-reported fares become published fares.',
  // A review queue full of unpublished claims should not sit in search results.
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function Page() {
  const groups = getPendingGroups();
  const currentFares = readFaresFile().buses;

  return (
    <FareReview
      groups={groups}
      adminConfigured={adminConfigured()}
      currentFares={currentFares as Record<string, { amount: number; source: string }>}
    />
  );
}
