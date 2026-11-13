/**
 * Description:  Tests the Discord REST client and the DM text.
 * Author:       Alex Wu
 * Dependencies: vitest, server/discord.ts, server/notifications.ts
 * Usage:        npm test
 */
import { expect, it, vi } from 'vitest';
import { DiscordRest, DiscordError, memberName } from '@/server/discord';
import { notificationText, reminderText } from '@/server/notifications';
it('retrieves newly joined members on each call without caching the original list', async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ user: { id: 'old', username: 'old' } }])))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { user: { id: 'old', username: 'old' } },
          { user: { id: 'new', username: 'new' } },
        ]),
      ),
    );
  const rest = new DiscordRest('test', f);
  expect((await rest.members('guild')).members).toHaveLength(1);
  expect((await rest.members('guild')).members).toHaveLength(2);
  expect(f.mock.calls.every((call) => call[1].cache === 'no-store')).toBe(true);
});
it('paginates members and excludes bots while preserving the raw cursor', async () => {
  const members = Array.from({ length: 100 }, (_, i) => ({
    user: { id: String(i), username: `user${i}`, bot: i === 99 },
  }));
  const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(members)));
  const r = await new DiscordRest('test', transport).members('guild', '', '123');
  expect(r.members).toHaveLength(99);
  expect(r.next).toBe('99');
  expect(transport.mock.calls[0][0]).toContain('after=123');
});
it('surfaces rate limit delay, forbidden and uncertain transport errors without sending retries', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ retry_after: 2.4 }), { status: 429 }));
  await expect(new DiscordRest('test', fetcher).guild('x')).rejects.toMatchObject({
    retryAfter: 3,
    status: 429,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(
    new DiscordRest('test', vi.fn().mockRejectedValue(new Error('network'))).message(
      'x',
      'secret',
      'nonce',
    ),
  ).rejects.toMatchObject({ uncertain: true });
  await expect(
    new DiscordRest('test', vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))).guild(
      'x',
    ),
  ).rejects.toBeInstanceOf(DiscordError);
});
it('uses a deterministic nonce and disables unexpected mentions', async () => {
  const f = vi.fn().mockResolvedValue(new Response('{"id":"1"}'));
  await new DiscordRest('test', f).message('channel', 'text', 'stable');
  const body = JSON.parse(f.mock.calls[0][1].body);
  expect(body).toMatchObject({
    nonce: 'stable',
    enforce_nonce: true,
    allowed_mentions: { parse: [] },
  });
});
it('notification dashboard link contains no credentials', () => {
  const text = notificationText(
    {
      exchange: { id: 'exchange', name: 'Winter @everyone', budget: 30, currency: 'USD' },
      recipient_discord_id: '123',
    },
    'https://example.test',
  );
  expect(text).toContain('https://example.test/exchanges/exchange');
  expect(text).not.toContain('@everyone');
  expect(text).not.toMatch(/token|secret=/i);
});
it('treats a lost DM-channel response as safe to retry but a lost message as uncertain', async () => {
  const offline = vi.fn().mockRejectedValue(new TypeError('network down'));
  const rest = new DiscordRest('test', offline);
  const channel = await rest.channel('123').catch((e: DiscordError) => e);
  const message = await rest.message('channel', 'hi', 'nonce').catch((e: DiscordError) => e);
  expect(channel).toBeInstanceOf(DiscordError);
  expect((channel as DiscordError).uncertain).toBe(false);
  expect((message as DiscordError).uncertain).toBe(true);
});
it('names members by server nickname, then display name, then username', () => {
  const user = { id: '1', username: 'alex89213', global_name: 'Alex' };
  expect(memberName({ user, nick: 'Santa Alex' })).toBe('Santa Alex');
  expect(memberName({ user })).toBe('Alex');
  expect(memberName({ user: { ...user, global_name: null } })).toBe('alex89213');
});
it('gets the application id for the bot invite link from the bot token', async () => {
  const transport = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: '42', name: 'Bot' })));
  expect(await new DiscordRest('test', transport).application()).toEqual({ id: '42', name: 'Bot' });
  expect(transport.mock.calls[0][0]).toBe('https://discord.com/api/v10/applications/@me');
});
it('writes the DM with the budget as a currency symbol and no ping-able text', () => {
  const text = notificationText(
    {
      exchange: { id: 'x', name: 'Christmas **2026**', budget: 1250, currency: 'USD' },
      recipient_discord_id: '123',
    },
    'https://santa.example',
  );
  expect(text).toBe(
    [
      '🎁 **Christmas 2026**',
      "You're giving to <@123>.",
      'Budget: $1,250',
      'See their wishlist: https://santa.example/exchanges/x',
    ].join('\n'),
  );
});
it('writes the wishlist reminder with a link to the wishlist page', () => {
  expect(reminderText({ name: 'Christmas @everyone' }, 'https://santa.example')).toBe(
    [
      '🎁 **Christmas everyone**',
      "Your wishlist is empty. Add a few ideas so your Secret Santa knows what you'd like:",
      'https://santa.example/wishlist',
    ].join('\n'),
  );
});
