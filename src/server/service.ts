/**
 * Description:  Runs each validated browser command, calling the database and Discord as needed.
 * Author:       Alex Wu
 * Dependencies: server-only, node:crypto, @supabase/supabase-js, server/supabase.ts, server/env.ts,
 *               domain/draw.ts, domain/privacy.ts, domain/types.ts, server/discord.ts,
 *               server/notifications.ts, server/validation.ts
 * Usage:
 */
import 'server-only';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { operation, rpc, displayName, discordId, AppError } from './supabase';
import { appUrl, env } from './env';
import { generateDraw, type HistoryPair, type Pair } from '@/domain/draw';
import { inspectChain } from '@/domain/privacy';
import type { Exchange, GroupDetail, DeliveryProgress } from '@/domain/types';
import { DiscordRest, DiscordError, memberName } from './discord';
import { processDeliveries, reminderText } from './notifications';
import type { Command, Input, Operation } from './validation';
export function matchesSecret(input: string, expected: string) {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(input), hash(expected));
}
type Handlers = { [K in Operation]: (user: User, payload: Input<K>) => Promise<unknown> };
/** Sends a validated payload unchanged to its database function. */
const forward =
  <K extends Operation>(name: K) =>
  (user: User, payload: Input<K>) =>
    operation(name, user.id, payload);
const deliveryProgress = (user: User, exchangeId: string) =>
  rpc<DeliveryProgress>('ssbu_delivery_progress', { actor: user.id, eid: exchangeId });
/** Gets the group and makes sure the person is one of its admins, before any Discord request. */
async function adminGroup(user: User, groupId: string) {
  const group = await operation<GroupDetail>('group', user.id, { group_id: groupId });
  if (!group.admin) throw new AppError('Group administrator access required.', 403);
  return group;
}
const handlers: Handlers = {
  context: (user) => operation('context', user.id, { display_name: displayName(user) }),
  group: forward('group'),
  exchange: forward('exchange'),
  past_member_add: forward('past_member_add'),
  exchange_create: forward('exchange_create'),
  participants_set: forward('participants_set'),
  history_import: forward('history_import'),
  history_correct: forward('history_correct'),
  exchange_status: forward('exchange_status'),
  wishlist: forward('wishlist'),
  wishlist_save: forward('wishlist_save'),
  wishlist_delete: forward('wishlist_delete'),
  wishlist_reorder: forward('wishlist_reorder'),
  notifications_queue: forward('notifications_queue'),
  notifications_retry: forward('notifications_retry'),
  async claim_owner(user, { secret }) {
    const attempt = await operation<{ allowed: boolean }>('setup_attempt', user.id);
    if (!attempt.allowed) throw new AppError('Too many setup attempts. Wait 15 minutes.', 429);
    const expected = env('INSTANCE_SETUP_SECRET');
    if (expected.length < 32)
      throw new AppError(
        'INSTANCE_SETUP_SECRET is missing or shorter than 32 characters. Fix it in your host’s environment variables, then deploy again.',
        503,
      );
    if (!matchesSecret(secret, expected)) throw new AppError('The setup secret is incorrect.', 403);
    await operation('context', user.id, { display_name: displayName(user) });
    return operation('claim_owner', user.id);
  },
  async activate_group(user, payload) {
    // make sure the actor is the owner before asking Discord about the server
    await operation('owner_check', user.id);
    const rest = new DiscordRest();
    const guild = await rest.guild(payload.guild_id);
    const group = await operation<{ id: string }>('activate_group', user.id, {
      ...payload,
      guild_id: guild.id,
    });
    // save the owner's name as it appears in this server, if the owner is a member of it
    const own = discordId(user);
    if (own) {
      const member = await rest.member(guild.id, own).catch((error: unknown) => {
        if (error instanceof DiscordError && error.status === 404) return null;
        throw error;
      });
      if (member)
        await operation('member_save', user.id, {
          group_id: group.id,
          discord_id: own,
          display_name: memberName(member),
        });
    }
    return group;
  },
  async discord_members(user, payload) {
    const group = await adminGroup(user, payload.group_id);
    const page = await new DiscordRest().members(
      group.group.guild_id,
      payload.query ?? '',
      payload.after,
    );
    // keep saved names current with Discord, updating only people whose name changed
    const latest = new Map(page.members.map((m) => [m.discord_id, m.display_name]));
    for (const m of group.members) {
      const name = m.discord_id ? latest.get(m.discord_id) : undefined;
      if (name && name !== m.display_name)
        await operation('member_save', user.id, {
          group_id: group.group.id,
          discord_id: m.discord_id,
          display_name: name,
          active: m.active,
        });
    }
    return page;
  },
  async member_save(user, payload) {
    const group = await adminGroup(user, payload.group_id);
    if (payload.active === false) return operation('member_save', user.id, payload);
    // check with Discord that the person is in the server before adding or restoring them
    const member = await new DiscordRest().member(group.group.guild_id, payload.discord_id);
    if (member.user.bot) throw new AppError('Bots cannot participate.');
    return operation('member_save', user.id, {
      ...payload,
      display_name: memberName(member),
    });
  },
  async generate(user, payload) {
    const ctx = await operation<{
      exchange: Exchange;
      group_revision: number;
      participants: string[];
      history: HistoryPair[];
    }>('draw_context', user.id, payload);
    const draw = generateDraw(ctx.participants, ctx.history, {
      mode: ctx.exchange.mode,
      recentCount: ctx.exchange.recent_count,
      random: () => randomInt(0, 2 ** 32) / 2 ** 32,
    });
    return operation('candidate_save', user.id, {
      ...payload,
      pairs: draw.pairs,
      optimal: draw.optimal,
      revision: ctx.exchange.revision,
      group_revision: ctx.group_revision,
    });
  },
  finalize: (user, payload) =>
    rpc('ssbu_finalize_reviewed_draw', {
      actor: user.id,
      eid: payload.exchange_id,
      expected_candidate_at: payload.candidate_created_at,
    }),
  async chain(user, payload) {
    const ctx = await rpc<{ own_member_id: string | null; pairs: Pair[] }>('ssbu_review_chain', {
      actor: user.id,
      eid: payload.exchange_id,
      expected_candidate_at: payload.candidate_created_at ?? null,
    });
    return {
      connections: inspectChain({
        pairs: ctx.pairs,
        admin: true,
        ownMemberId: ctx.own_member_id ?? undefined,
        start: payload.start,
        count: payload.count,
        acknowledge: payload.acknowledge,
        acknowledgeFull: payload.acknowledgeFull,
      }),
    };
  },
  exchange_delete: (user, payload) =>
    rpc('ssbu_delete_exchange', {
      actor: user.id,
      eid: payload.exchange_id,
      confirmation: payload.confirm_name,
    }),
  notifications_status: (user, payload) => deliveryProgress(user, payload.exchange_id),
  wishlist_status: forward('wishlist_status'),
  async wishlist_remind(user, payload) {
    // the database checks the admin and the hourly limit, then returns who to remind
    const round = await operation<{
      exchange: { id: string; name: string };
      people: { discord_id: string; display_name: string }[];
    }>('wishlist_reminder', user.id, payload);
    const rest = new DiscordRest(),
      text = reminderText(round.exchange, appUrl()),
      started = Date.now();
    const sent: string[] = [],
      failed: string[] = [];
    for (const person of round.people) {
      // stop before the request runs out of time, and count anyone left as not reached
      if (Date.now() - started > 25000) {
        failed.push(person.display_name);
        continue;
      }
      try {
        const channel = await rest.channel(person.discord_id);
        await rest.message(channel.id, text, randomBytes(12).toString('hex'));
        sent.push(person.display_name);
      } catch {
        failed.push(person.display_name);
      }
    }
    return { sent, failed };
  },
  async notifications_send(user, payload) {
    await operation('notifications_queue', user.id, payload);
    await processDeliveries(payload.exchange_id);
    return deliveryProgress(user, payload.exchange_id);
  },
  async notifications_process(user, payload) {
    await operation('notifications_authorize', user.id, payload);
    await processDeliveries(payload.exchange_id);
    return deliveryProgress(user, payload.exchange_id);
  },
};
export function execute(user: User, command: Command): Promise<unknown> {
  const handler = handlers[command.operation] as (
    user: User,
    payload: Command['payload'],
  ) => Promise<unknown>;
  return handler(user, command.payload);
}
