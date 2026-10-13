import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri, Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider, themeInitScript } from '@/Utils/ThemeContext';
import { LangProvider } from '@/Utils/LangContext';
import { StopSearchProvider } from '@/Utils/StopSearchContext';
import Navbar from '@/Components/Navbar';
import Footer from '@/Components/Footer';

const bengali = Hind_Siliguri({
  variable: '--font-bengali',
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ঢাকার লোকাল বাস | Dhaka Local Bus',
  description:
    'ঢাকার লোকাল বাসের রুট ও ভাড়া — কোন বাস কোথায় যায় তা খুঁজে বের করুন। Find which local bus goes where in Dhaka, and what it costs.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="bn"
      suppressHydrationWarning
      // globals.css sets scroll-behavior: smooth on <html>. Next.js animates
      // the scroll itself on a route change, and without this attribute its
      // own scroll plus the CSS one fight each other, so the transition stutters
      // and the console fills with warnings. Declaring it lets Next.js turn the
      // CSS behaviour off for the duration of a transition.
      data-scroll-behavior="smooth"
      className={`${bengali.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the stored theme before first paint, so no white flash.
            Plain <script>, not next/script: beforeInteractive is a pages-router
            concept, and next/script inside app-router head triggers a React 19
            "script tag while rendering" console error. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <ThemeProvider>
          <LangProvider>
            <StopSearchProvider>
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </StopSearchProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
