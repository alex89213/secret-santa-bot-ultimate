/**
 * Description:  Tests how the site's public address is chosen from APP_URL and Vercel's settings.
 * Author:       Alex Wu
 * Dependencies: vitest, server/env.ts
 * Usage:        npm test
 */
import { afterEach, expect, it, vi } from 'vitest';
import { appUrl } from '@/server/env';
afterEach(() => vi.unstubAllEnvs());
it('uses APP_URL when it is set', () => {
  vi.stubEnv('APP_URL', 'https://santa.example.org/');
  expect(appUrl()).toBe('https://santa.example.org');
});
it('falls back to the Vercel production address when APP_URL is missing or localhost', () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'santa.vercel.app');
  vi.stubEnv('APP_URL', '');
  expect(appUrl()).toBe('https://santa.vercel.app');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  expect(appUrl()).toBe('https://santa.vercel.app');
  // a real custom domain should still win over the vercel.app address
  vi.stubEnv('APP_URL', 'https://santa.example.org');
  expect(appUrl()).toBe('https://santa.example.org');
});
it('uses localhost outside Vercel when nothing is set', () => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('APP_URL', '');
  expect(appUrl()).toBe('http://localhost:3000');
});
