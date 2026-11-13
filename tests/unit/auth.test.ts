/**
 * Description:  Tests that sessions are checked with Supabase and only Discord accounts get
 *               through.
 * Author:       Alex Wu
 * Dependencies: vitest, server/supabase.ts
 * Usage:        npm test
 */
import { expect, it, vi, beforeEach } from 'vitest';
const getUser = vi.hoisted(() => vi.fn());
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
import { actor, displayName, discordId } from '@/server/supabase';
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test';
});
it('validates the session remotely and rejects unauthenticated or non-Discord users', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
  await expect(actor()).rejects.toMatchObject({ status: 401 });
  getUser.mockResolvedValue({
    data: {
      user: {
        id: 'user',
        user_metadata: { provider: 'discord', sub: 'forged' },
        identities: [{ provider: 'email' }],
      },
    },
    error: null,
  });
  await expect(actor()).rejects.toMatchObject({ status: 403 });
  getUser.mockResolvedValue({
    data: { user: { id: 'user', identities: [{ provider: 'discord' }] } },
    error: null,
  });
  await expect(actor()).resolves.toMatchObject({ id: 'user' });
  expect(getUser).toHaveBeenCalledTimes(3);
});
it('shows the Discord display name, falling back to the username', () => {
  // supabase stores the username as full_name and the display name as custom_claims.global_name
  const meta = { full_name: 'alex89213', name: 'alex89213#0' };
  expect(displayName({ user_metadata: { ...meta, custom_claims: { global_name: 'Alex' } } })).toBe(
    'Alex',
  );
  expect(displayName({ user_metadata: meta })).toBe('alex89213');
  expect(displayName({ user_metadata: {} })).toBe('Discord member');
});
it('reads the Discord user id from the Discord identity only', () => {
  expect(
    discordId({
      identities: [
        { provider: 'email', id: 'x' },
        { provider: 'discord', id: '12345678901234567' },
      ] as never,
    }),
  ).toBe('12345678901234567');
  expect(discordId({ identities: [] })).toBeUndefined();
});
