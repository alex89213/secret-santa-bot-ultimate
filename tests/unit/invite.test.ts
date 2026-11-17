/**
 * Description:  Tests the bot invite flow: the invite link, who can start an invite, and setting up
 *               the server when Discord sends the person back.
 * Author:       Alex Wu
 * Dependencies: vitest, next, server/invite.ts, app/bot/invite/route.ts, app/bot/added/route.ts
 * Usage:        npm test
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  operation: vi.fn(),
  execute: vi.fn(),
  application: vi.fn(),
}));
vi.mock('@/server/supabase', () => ({
  actor: mocks.actor,
  operation: mocks.operation,
  displayName: () => 'Alex',
  AppError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock('@/server/service', () => ({ execute: mocks.execute }));
vi.mock('@/server/discord', () => ({
  DiscordRest: class {
    application = mocks.application;
  },
}));
import { inviteUrl } from '@/server/invite';
import { AppError } from '@/server/supabase';
import { GET as invite } from '@/app/bot/invite/route';
import { GET as added } from '@/app/bot/added/route';
const GUILD = '800000000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  mocks.actor.mockResolvedValue({ id: 'user' });
});
const back = (query: string, state = 'abc') =>
  new NextRequest(`http://localhost:3000/bot/added?${query}`, {
    headers: state ? { cookie: `ssbu-invite-state=${state}` } : {},
  });
const where = (r: Response) =>
  new URL(r.headers.get('location')!).pathname + new URL(r.headers.get('location')!).search;
it('asks Discord to send the person back to the site with the server ID', () => {
  const url = new URL(inviteUrl('123', 'abc'));
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/bot/added');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('state')).toBe('abc');
  expect(url.searchParams.get('permissions')).toBe('0');
});
it('sends an admin to Discord with a new state saved in a cookie', async () => {
  mocks.operation.mockResolvedValue({ owner: false, groups: [{ admin: true }] });
  mocks.application.mockResolvedValue({ id: '123' });
  const r = await invite();
  const url = new URL(r.headers.get('location')!);
  expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
  expect(url.searchParams.get('client_id')).toBe('123');
  const cookie = r.cookies.get('ssbu-invite-state')!;
  // the state in the link should match the cookie, which scripts can't read
  expect(cookie.value).toHaveLength(32);
  expect(url.searchParams.get('state')).toBe(cookie.value);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/bot' });
});
it('starts no invite for people who are signed out or manage no server', async () => {
  mocks.operation.mockResolvedValue({ owner: false, groups: [{ admin: false }] });
  expect(where(await invite())).toBe('/servers');
  mocks.actor.mockRejectedValue(new AppError('Sign in', 401));
  expect(where(await invite())).toBe('/login');
  // Discord should never be asked on behalf of someone who can't invite the bot
  expect(mocks.application).not.toHaveBeenCalled();
});
it('returns to the servers page with a message when Discord cannot be reached', async () => {
  mocks.operation.mockResolvedValue({ owner: true, groups: [] });
  mocks.application.mockRejectedValue(new Error('offline'));
  const r = await invite();
  expect(where(r)).toBe('/servers?invite=unreachable');
  expect(r.cookies.get('ssbu-invite-state')).toBeUndefined();
});
it('sets up the server and opens it when the owner comes back from Discord', async () => {
  mocks.operation.mockResolvedValue({ owner: true, groups: [] });
  mocks.execute.mockResolvedValue({ id: 'g1' });
  const r = await added(back(`guild_id=${GUILD}&state=abc&code=x`));
  expect(where(r)).toBe('/groups/g1');
  expect(mocks.execute).toHaveBeenCalledWith(
    { id: 'user' },
    { operation: 'activate_group', payload: { guild_id: GUILD } },
  );
});
it('ignores returns that the site did not start, without setting anything up', async () => {
  expect(where(await added(back(`guild_id=${GUILD}&state=other`)))).toBe('/servers?invite=expired');
  expect(where(await added(back(`guild_id=${GUILD}&state=abc`, '')))).toBe(
    '/servers?invite=expired',
  );
  expect(where(await added(back(`guild_id=${GUILD}`)))).toBe('/servers?invite=expired');
  // the session should not even be read before the state matches
  expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('opens a server that is already set up, and leaves setup to the owner', async () => {
  mocks.operation.mockResolvedValue({ owner: true, groups: [{ id: 'g0', guild_id: GUILD }] });
  expect(where(await added(back(`guild_id=${GUILD}&state=abc`)))).toBe('/groups/g0');
  mocks.operation.mockResolvedValue({ owner: false, groups: [] });
  expect(where(await added(back(`guild_id=${GUILD}&state=abc`)))).toBe('/servers?invite=owner');
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('returns to the servers page when the person cancels in Discord', async () => {
  expect(where(await added(back('error=access_denied&state=abc')))).toBe('/servers');
});
it('sets nothing up for a server ID that is not a Discord ID', async () => {
  expect(where(await added(back('guild_id=../groups&state=abc')))).toBe('/servers?invite=failed');
  expect(where(await added(back('state=abc')))).toBe('/servers?invite=failed');
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('asks for sign-in when the session ended, and reports a failed setup', async () => {
  mocks.actor.mockRejectedValue(new AppError('Sign in', 401));
  expect(where(await added(back(`guild_id=${GUILD}&state=abc`)))).toBe('/login');
  mocks.actor.mockResolvedValue({ id: 'user' });
  mocks.operation.mockResolvedValue({ owner: true, groups: [] });
  mocks.execute.mockRejectedValue(new Error('Discord denied access'));
  const r = await added(back(`guild_id=${GUILD}&state=abc`));
  expect(where(r)).toBe('/servers?invite=failed');
  // the state should be used up either way
  expect(r.cookies.get('ssbu-invite-state')?.value).toBe('');
});
