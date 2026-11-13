/**
 * Description:  Next.js settings: standalone output, a separate build folder for the browser tests,
 *               and security headers.
 * Author:       Alex Wu
 * Dependencies: next
 * Usage:
 */
import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.SSBU_E2E_SERVER === '1' ? '.next-e2e' : '.next',
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'" +
              (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '') +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.supabase.co http://127.0.0.1:54321",
          },
        ],
      },
    ];
  },
};
export default config;
