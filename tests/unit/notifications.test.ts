/**
 * Description:  Tests DM batch processing and how each Discord result is saved.
 * Author:       Alex Wu
 * Dependencies: vitest, server/notifications.ts, server/discord.ts
 * Usage:        npm test
 */
import { it, expect, vi, beforeEach } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/server/supabase', () => ({
  privilegedClient: () => ({ rpc }),
  AppError: class extends Error {},
}));
import { processDeliveries } from '@/server/notifications';
import { DiscordRest, DiscordError } from '@/server/discord';
const job = {
  delivery: {
    id: '12345678-1234-1234-1234-123456789012',
    lease_id: 'lease',
    channel_id: null,
    attempts: 1,
  },
  exchange: { id: 'exchange', name: 'Winter', budget: 20, currency: 'USD' },
  giver_discord_id: 'giver',
  recipient_discord_id: 'recipient',
};
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'https://example.test';
});
it('marks sent deliveries with the exact lease and never regenerates assignments', async () => {
  rpc
    .mockResolvedValueOnce({ data: job })
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: null });
  const rest = new DiscordRest('mock');
  rest.channel = vi.fn().mockResolvedValue({ id: 'channel' });
  rest.message = vi.fn().mockResolvedValue({ id: 'message' });
  expect(await processDeliveries('exchange', 5, rest)).toEqual({ processed: 1 });
  expect(rpc).toHaveBeenCalledWith('ssbu_finish_delivery', {
    did: job.delivery.id,
    lease: 'lease',
    outcome: { status: 'sent', message_id: 'message', channel_id: 'channel' },
  });
  expect(rpc.mock.calls.map((c) => c[0])).not.toContain('ssbu_command');
});
it('persists rate-limited pending work and stops the batch without sleeping', async () => {
  rpc.mockResolvedValueOnce({ data: job }).mockResolvedValueOnce({ data: true });
  const rest = new DiscordRest('mock');
  rest.channel = vi.fn().mockRejectedValue(new DiscordError(429, 30));
  await processDeliveries('exchange', 5, rest);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls[1][1].outcome).toMatchObject({
    status: 'pending',
    retry_after: 30,
    error_code: 'rate_limited',
  });
});
it('marks uncertain network sends failed for explicit review', async () => {
  rpc
    .mockResolvedValueOnce({ data: job })
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: null });
  const rest = new DiscordRest('mock');
  rest.channel = vi.fn().mockResolvedValue({ id: 'channel' });
  rest.message = vi.fn().mockRejectedValue(new DiscordError(0, 0, true));
  await processDeliveries('exchange', 5, rest);
  expect(rpc.mock.calls[1][1].outcome).toMatchObject({
    status: 'failed',
    error_code: 'uncertain_delivery',
  });
  expect(rest.message).toHaveBeenCalledTimes(1);
});
it('delivers every giver across resumable batches without regenerating or duplicating the draw', async () => {
  const jobs = Array.from({ length: 8 }, (_, i) => ({
    ...job,
    delivery: { ...job.delivery, id: `12345678-1234-1234-1234-${String(i).padStart(12, '0')}` },
    giver_discord_id: `giver-${i}`,
    recipient_discord_id: `recipient-${i}`,
  }));
  const saved: string[] = [];
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'ssbu_claim_delivery') return { data: jobs.shift() ?? null };
    if (name === 'ssbu_finish_delivery') {
      saved.push(String(args.did));
      return { data: true };
    }
    throw new Error('Unexpected database operation');
  });
  const rest = new DiscordRest('mock');
  rest.channel = vi.fn().mockImplementation(async (id: string) => ({ id: `channel-${id}` }));
  rest.message = vi.fn().mockResolvedValue({ id: 'message' });
  expect(await processDeliveries('exchange', 5, rest)).toEqual({ processed: 5 });
  expect(await processDeliveries('exchange', 5, rest)).toEqual({ processed: 3 });
  expect(await processDeliveries('exchange', 5, rest)).toEqual({ processed: 0 });
  expect(rest.channel).toHaveBeenCalledTimes(8);
  expect(rest.message).toHaveBeenCalledTimes(8);
  expect(new Set(saved).size).toBe(8);
  expect(vi.mocked(rest.channel).mock.calls.map((c) => c[0])).toEqual(
    Array.from({ length: 8 }, (_, i) => `giver-${i}`),
  );
});
