/**
 * Description:  Sends waiting assignment DMs in small batches and saves each result under the
 *               delivery's lease.
 * Author:       Alex Wu
 * Dependencies: server-only, server/supabase.ts, server/discord.ts, server/env.ts
 * Usage:
 */
import 'server-only';
import { privilegedClient, AppError } from './supabase';
import { DiscordRest, DiscordError } from './discord';
import { appUrl } from './env';
import { formatMoney } from '@/domain/money';
type Job = {
  delivery: { id: string; lease_id: string; channel_id: string | null; attempts: number };
  exchange: { id: string; name: string; budget: number | null; currency: string };
  giver_discord_id: string;
  recipient_discord_id: string;
};
/** Removes characters Discord treats as formatting or mentions from an exchange name. */
function dmTitle(name: string) {
  return name.replace(/[@*_`~<>|\\\r\n]/g, '').slice(0, 100);
}
export function notificationText(
  job: Pick<Job, 'exchange' | 'recipient_discord_id'>,
  origin: string,
) {
  const { budget, currency } = job.exchange;
  return [
    `🎁 **${dmTitle(job.exchange.name)}**`,
    `You're giving to <@${job.recipient_discord_id}>.`,
    ...(budget !== null ? [`Budget: ${formatMoney(budget, currency)}`] : []),
    `See their wishlist: ${origin}/exchanges/${job.exchange.id}`,
  ].join('\n');
}
/** Writes the reminder DM for someone in an exchange whose wishlist is empty. */
export function reminderText(exchange: { name: string }, origin: string) {
  return [
    `🎁 **${dmTitle(exchange.name)}**`,
    "Your wishlist is empty. Add a few ideas so your Secret Santa knows what you'd like:",
    `${origin}/wishlist`,
  ].join('\n');
}
export async function processDeliveries(exchangeId?: string, limit = 5, rest = new DiscordRest()) {
  const db = privilegedClient();
  let processed = 0;
  const started = Date.now();
  for (let i = 0; i < limit; i++) {
    // stop early to leave time for two Discord requests and saving the result
    if (i > 0 && Date.now() - started > 25000) break;
    const { data, error } = await db.rpc('ssbu_claim_delivery', { eid: exchangeId ?? null });
    if (error) throw new AppError('Unable to claim the next notification.', 503);
    if (!data) break;
    const job = data as Job;
    let outcome: Record<string, unknown>;
    let channelId = job.delivery.channel_id;
    try {
      if (!channelId) channelId = (await rest.channel(job.giver_discord_id)).id;
      // a short nonce from the delivery id lets Discord drop a repeat of a recent message
      const message = await rest.message(
        channelId,
        notificationText(job, appUrl()),
        job.delivery.id.replaceAll('-', '').slice(0, 24),
      );
      outcome = { status: 'sent', message_id: message.id, channel_id: channelId };
    } catch (error) {
      const discord = error instanceof DiscordError ? error : null;
      outcome = {
        status: discord?.status === 429 && job.delivery.attempts < 10 ? 'pending' : 'failed',
        channel_id: channelId,
        error_code: discord?.uncertain
          ? 'uncertain_delivery'
          : discord?.status === 429
            ? 'rate_limited'
            : discord?.status === 403
              ? 'dm_forbidden'
              : 'discord_unavailable',
        retry_after: discord?.retryAfter || 1,
      };
    }
    const result = await db.rpc('ssbu_finish_delivery', {
      did: job.delivery.id,
      lease: job.delivery.lease_id,
      outcome,
    });
    if (result.error || !result.data)
      throw new AppError(
        'Delivery result could not be saved. It will require review before retrying.',
        503,
      );
    processed++;
    if (outcome.status === 'pending') break;
  }
  return { processed };
}
