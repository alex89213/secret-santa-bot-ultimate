/**
 * Description:  Tests that commands pass the right actor and checks to the database and Discord.
 * Author:       Alex Wu
 * Dependencies: vitest, @supabase/supabase-js, server/service.ts
 * Usage:        npm test
 */
import { it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  process: vi.fn(),
  guild: vi.fn(),
  member: vi.fn(),
  members: vi.fn(),
  channel: vi.fn(),
  message: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/server/supabase', () => ({
  operation: mocks.operation,
  rpc: mocks.rpc,
  displayName: (u: { user_metadata?: { full_name?: string } }) =>
    u.user_metadata?.full_name ?? 'Discord member',
  discordId: () => '12345678901234567',
  AppError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock('@/server/notifications', () => ({
  processDeliveries: mocks.process,
  reminderText: () => 'reminder',
}));
vi.mock('@/server/discord', () => ({
  DiscordRest: class {
    guild = mocks.guild;
    member = mocks.member;
    members = mocks.members;
    channel = mocks.channel;
    message = mocks.message;
  },
  DiscordError: class extends Error {
    constructor(public status: number) {
      super('discord');
    }
  },
  memberName: (m: { nick?: string; user: { global_name?: string; username: string } }) =>
    m.nick || m.user.global_name || m.user.username,
}));
import { execute, matchesSecret } from '@/server/service';
const user = {
  id: 'user',
  user_metadata: { provider_id: 'forged', full_name: 'Cosmetic name' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01',
} as User;
beforeEach(() => vi.resetAllMocks());
it('binds exchange deletion to the authenticated actor', async () => {
  mocks.rpc.mockResolvedValue({ deleted: true });
  await execute(user, {
    operation: 'exchange_delete',
    payload: { exchange_id: 'exchange', confirm_name: 'Winter' },
  });
  expect(mocks.rpc).toHaveBeenCalledWith('ssbu_delete_exchange', {
    actor: 'user',
    eid: 'exchange',
    confirmation: 'Winter',
  });
});
it('returns only the requested chain edge from the server mapping', async () => {
  mocks.rpc.mockResolvedValue({
    own_member_id: 'a',
    pairs: [
      { giver: 'a', recipient: 'b' },
      { giver: 'b', recipient: 'c' },
      { giver: 'c', recipient: 'a' },
    ],
  });
  expect(
    await execute(user, {
      operation: 'chain',
      payload: { exchange_id: 'exchange', count: 1 },
    } as never),
  ).toEqual({
    connections: [{ giver: 'a', recipient: 'b' }],
  });
  expect(mocks.rpc).toHaveBeenCalledWith('ssbu_review_chain', {
    actor: 'user',
    eid: 'exchange',
    expected_candidate_at: null,
  });
});
it('binds draft review and finalization to the displayed candidate version', async () => {
  const stamp = '2026-11-13T10:00:00.123456+00:00';
  mocks.rpc
    .mockResolvedValueOnce({
      own_member_id: 'a',
      pairs: [
        { giver: 'a', recipient: 'b' },
        { giver: 'b', recipient: 'a' },
      ],
    })
    .mockResolvedValueOnce({ finalized: true });
  await execute(user, {
    operation: 'chain',
    payload: { exchange_id: 'x', count: 1, candidate_created_at: stamp },
  } as never);
  await execute(user, {
    operation: 'finalize',
    payload: { exchange_id: 'x', candidate_created_at: stamp },
  } as never);
  expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'ssbu_review_chain', {
    actor: 'user',
    eid: 'x',
    expected_candidate_at: stamp,
  });
  expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'ssbu_finalize_reviewed_draw', {
    actor: 'user',
    eid: 'x',
    expected_candidate_at: stamp,
  });
  expect(mocks.process).not.toHaveBeenCalled();
});
it('authorizes and queues everyone before processing sends, then returns only delivery progress', async () => {
  const summary = {
    total: 8,
    pending: 3,
    sent: 5,
    sending: 0,
    failed: 0,
    deliveries: [],
    next_attempt_at: null,
  };
  mocks.operation.mockResolvedValue({ queued: true });
  mocks.process.mockResolvedValue({ processed: 5 });
  mocks.rpc.mockResolvedValue(summary);
  expect(
    await execute(user, {
      operation: 'notifications_send',
      payload: { exchange_id: 'x' },
    } as never),
  ).toEqual(summary);
  expect(mocks.operation).toHaveBeenCalledWith('notifications_queue', 'user', { exchange_id: 'x' });
  expect(mocks.operation.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.process.mock.invocationCallOrder[0],
  );
  expect(mocks.process).toHaveBeenCalledWith('x');
  expect(mocks.rpc).toHaveBeenCalledWith('ssbu_delivery_progress', { actor: 'user', eid: 'x' });
});
it('does not process notifications when queue authorization fails', async () => {
  mocks.operation.mockRejectedValue(new Error('Forbidden'));
  await expect(
    execute(user, { operation: 'notifications_send', payload: { exchange_id: 'x' } } as never),
  ).rejects.toThrow('Forbidden');
  expect(mocks.process).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('does not call Discord or disclose data if database authorization fails', async () => {
  mocks.operation.mockRejectedValue(new Error('Forbidden'));
  await expect(
    execute(user, { operation: 'activate_group', payload: { guild_id: 'guild' } } as never),
  ).rejects.toThrow('Forbidden');
  expect(mocks.guild).not.toHaveBeenCalled();
  await expect(
    execute(user, { operation: 'notifications_process', payload: { exchange_id: 'x' } } as never),
  ).rejects.toThrow();
  expect(mocks.process).not.toHaveBeenCalled();
});
it('compares setup secrets without plaintext comparisons and checks rate limits first', async () => {
  expect(matchesSecret('a', 'a')).toBe(true);
  expect(matchesSecret('a', 'longer')).toBe(false);
  mocks.operation.mockResolvedValue({ allowed: false });
  await expect(
    execute(user, { operation: 'claim_owner', payload: { secret: 'x' } } as never),
  ).rejects.toThrow('Too many');
  expect(mocks.operation).toHaveBeenCalledTimes(1);
});
it('passes only cosmetic metadata during profile sync', async () => {
  mocks.operation.mockResolvedValue({});
  await execute(user, { operation: 'context', payload: {} } as never);
  expect(mocks.operation).toHaveBeenCalledWith('context', 'user', {
    display_name: 'Cosmetic name',
  });
});
it('verifies a new member with Discord before saving and uses the Discord display name', async () => {
  mocks.operation.mockImplementation(async (name: string) =>
    name === 'group' ? { admin: true, group: { guild_id: 'guild' } } : { saved: true },
  );
  mocks.member.mockResolvedValue({ user: { id: '1', username: 'real', bot: false }, nick: 'Nick' });
  await execute(user, {
    operation: 'member_save',
    payload: { group_id: 'g', discord_id: '12345678901234567', display_name: 'Forged' },
  });
  expect(mocks.member).toHaveBeenCalledWith('guild', '12345678901234567');
  expect(mocks.operation).toHaveBeenLastCalledWith('member_save', 'user', {
    group_id: 'g',
    discord_id: '12345678901234567',
    display_name: 'Nick',
  });
});
it('never calls Discord for a non-administrator member lookup', async () => {
  mocks.operation.mockResolvedValue({ admin: false, group: { guild_id: 'guild' } });
  await expect(
    execute(user, { operation: 'discord_members', payload: { group_id: 'g' } }),
  ).rejects.toThrow('administrator');
  expect(mocks.member).not.toHaveBeenCalled();
});
it('updates saved names that changed in Discord when the people list refreshes', async () => {
  mocks.operation.mockImplementation(async (name: string) =>
    name === 'group'
      ? {
          admin: true,
          group: { id: 'g', guild_id: 'guild' },
          members: [
            { discord_id: '1', display_name: 'Same', active: true },
            { discord_id: '2', display_name: 'Old name', active: false },
            { discord_id: null, display_name: 'Past only', active: false },
          ],
        }
      : { saved: true },
  );
  mocks.members.mockResolvedValue({
    members: [
      { discord_id: '1', display_name: 'Same' },
      { discord_id: '2', display_name: 'New name' },
    ],
    next: null,
  });
  await execute(user, { operation: 'discord_members', payload: { group_id: 'g' } });
  const saves = mocks.operation.mock.calls.filter(([name]) => name === 'member_save');
  // only the renamed person should be saved, keeping their removed state
  expect(saves).toEqual([
    [
      'member_save',
      'user',
      { group_id: 'g', discord_id: '2', display_name: 'New name', active: false },
    ],
  ]);
});
it("saves the owner's name in the new server, and skips it when the owner isn't in the server", async () => {
  mocks.operation.mockImplementation(async (name: string) =>
    name === 'activate_group' ? { id: 'g' } : { owner: true },
  );
  mocks.guild.mockResolvedValue({ id: '800000000000000001', name: 'Server' });
  mocks.member.mockResolvedValue({ user: { id: '1', username: 'user', global_name: 'Alex' } });
  const payload = { guild_id: '800000000000000001', name: 'Server' };
  expect(await execute(user, { operation: 'activate_group', payload })).toEqual({ id: 'g' });
  expect(mocks.operation).toHaveBeenLastCalledWith('member_save', 'user', {
    group_id: 'g',
    discord_id: '12345678901234567',
    display_name: 'Alex',
  });
  mocks.operation.mockClear();
  const { DiscordError } = await import('@/server/discord');
  mocks.member.mockRejectedValue(new DiscordError(404));
  await execute(user, { operation: 'activate_group', payload });
  expect(mocks.operation.mock.calls.map(([name]) => name)).not.toContain('member_save');
});
it('DMs everyone the database returns for a reminder and reports who it missed', async () => {
  process.env.APP_URL = 'https://santa.example';
  mocks.operation.mockResolvedValue({
    exchange: { id: 'x', name: 'Christmas' },
    people: [
      { discord_id: '1', display_name: 'Ann' },
      { discord_id: '2', display_name: 'Ben' },
    ],
  });
  mocks.channel.mockResolvedValue({ id: 'dm' });
  mocks.message.mockResolvedValueOnce({ id: 'm1' }).mockRejectedValueOnce(new Error('closed'));
  expect(
    await execute(user, { operation: 'wishlist_remind', payload: { exchange_id: 'x' } }),
  ).toEqual({ sent: ['Ann'], failed: ['Ben'] });
  expect(mocks.operation).toHaveBeenCalledWith('wishlist_reminder', 'user', { exchange_id: 'x' });
  expect(mocks.message).toHaveBeenCalledTimes(2);
});
it('sends no reminders when the database refuses the round', async () => {
  mocks.operation.mockRejectedValue(new Error('A reminder was sent less than an hour ago'));
  await expect(
    execute(user, { operation: 'wishlist_remind', payload: { exchange_id: 'x' } }),
  ).rejects.toThrow('less than an hour');
  expect(mocks.channel).not.toHaveBeenCalled();
});
