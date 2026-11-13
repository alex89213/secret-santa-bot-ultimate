/**
 * Description:  Tests the command endpoint's request checks and the sign-in callback route.
 * Author:       Alex Wu
 * Dependencies: vitest, next, app/api/command/route.ts, app/auth/callback/route.ts
 * Usage:        npm test
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  execute: vi.fn(),
  exchange: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/server/supabase', () => ({
  actor: mocks.actor,
  AppError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  sessionClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchange,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock('@/server/service', () => ({ execute: mocks.execute }));
import { POST } from '@/app/api/command/route';
import { GET as callback } from '@/app/auth/callback/route';
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'http://localhost:3000';
});
const req = (body: unknown, origin = 'http://localhost:3000') =>
  new NextRequest('http://localhost:3000/api/command', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
it('rejects cross-site requests before authentication and denies unlisted operations', async () => {
  expect((await POST(req({}, 'https://evil.test'))).status).toBe(403);
  expect(mocks.actor).not.toHaveBeenCalled();
  mocks.actor.mockResolvedValue({ id: 'user' });
  expect((await POST(req({ operation: 'draw_context', payload: {} }))).status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('never echoes the request body or internal exception details', async () => {
  mocks.actor.mockResolvedValue({ id: 'user' });
  mocks.execute.mockRejectedValue(new Error('private assignment a -> b / secret token'));
  const response = await POST(req({ operation: 'context' }));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toMatch(/assignment|token/);
});
it('accepts only verified Discord callbacks and ignores client redirect targets', async () => {
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { identities: [{ provider: 'discord' }] } } });
  const response = await callback(
    new NextRequest('http://localhost:3000/auth/callback?code=test&next=https://evil.test'),
  );
  expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard');
  expect(mocks.exchange).toHaveBeenCalledWith('test');
});
it('returns to /setup after sign-in only when the sign-in cookie asks for it', async () => {
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { identities: [{ provider: 'discord' }] } } });
  const withCookie = (value: string) =>
    new NextRequest('http://localhost:3000/auth/callback?code=test', {
      headers: { cookie: `ssbu-after-sign-in=${value}` },
    });
  expect((await callback(withCookie('setup'))).headers.get('location')).toBe(
    'http://localhost:3000/setup',
  );
  // any other value should fall back to Home
  expect((await callback(withCookie('https://evil.test'))).headers.get('location')).toBe(
    'http://localhost:3000/dashboard',
  );
});
it('clears non-Discord callback sessions and rejects invalid authorization codes', async () => {
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { identities: [{ provider: 'email' }] } } });
  expect(
    (await callback(new NextRequest('http://localhost:3000/auth/callback?code=test'))).headers.get(
      'location',
    ),
  ).toContain('error=callback');
  expect(mocks.signOut).toHaveBeenCalled();
  mocks.exchange.mockResolvedValue({ error: new Error('bad code') });
  expect(
    (await callback(new NextRequest('http://localhost:3000/auth/callback?code=bad'))).headers.get(
      'location',
    ),
  ).toContain('error=callback');
});
