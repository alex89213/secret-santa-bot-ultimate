/**
 * Description:  Root layout that loads the Geist and Literata fonts and the global styles.
 * Author:       Alex Wu
 * Dependencies: next, globals.css
 * Usage:
 */
import type { Metadata, Viewport } from 'next';
import { Geist, Literata } from 'next/font/google';
import './globals.css';
// both fonts are under the SIL Open Font License, and next/font serves them from this site
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const literata = Literata({ subsets: ['latin'], variable: '--font-literata' });
export const metadata: Metadata = {
  title: { default: 'Secret Santa', template: '%s · Secret Santa' },
  description: 'Draw names, share wishlists, and get your match by Discord DM.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#0f1f1a', colorScheme: 'dark' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${literata.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
