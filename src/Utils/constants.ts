/** Copy that would otherwise be duplicated between the client and the server. */

export const DATA_CAVEAT = {
  bn: 'রুট তথ্য ২০২৪ সালে সংগৃহীত এবং পুরনো হতে পারে। ভাড়ার তথ্য এখনো যাচাই করা হয়নি, তাই যেখানে ভাড়া দেখা যাচ্ছে না সেখানে আমরা অনুমান করি না। সঠিক তথ্য জানালে আমরা কৃতজ্ঞ।',
  en: 'Route data was collected in 2024 and may be out of date. Fares have not been verified yet, so we do not guess where a fare is missing. Corrections are welcome.',
} as const;

export const FARE_UNKNOWN = {
  bn: 'ভাড়া যাচাই করা হয়নি',
  en: 'Fare not verified',
} as const;
