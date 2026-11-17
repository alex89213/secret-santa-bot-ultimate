/**
 * Description:  Zod schemas for every command the browser can send.
 * Author:       Alex Wu
 * Dependencies: zod
 * Usage:
 */
import { z } from 'zod';
import { CURRENCIES } from '@/domain/money';
const uuid = z.uuid(),
  snowflake = z.string().regex(/^[1-9][0-9]{16,19}$/, 'Enter a valid Discord user ID.'),
  name = z.string().trim().min(1),
  exchange_id = uuid,
  group_id = uuid;
const nullableMoney = z.number().min(0).max(99999999).nullable();
const match = z.object({ giver: uuid, recipient: uuid });
// past years list people by member id, so past-only people don't need a Discord ID
const pastYear = {
  name: name.max(100),
  members: z.array(uuid).min(2).max(200),
  pairs: z.array(match).min(1, 'Add at least one known match.').max(200),
};
const exchangeInput = z.object({
  group_id,
  name: name.max(100),
  budget: nullableMoney,
  currency: z.enum(CURRENCIES),
  mode: z.enum(['strict', 'recent', 'minimize']),
  recent_count: z.number().int().min(1).max(100),
});
const wishlistInput = z.object({
  id: uuid.optional(),
  title: name.max(120),
  description: z.string().max(2000),
  url: z.union([
    z.literal(''),
    z
      .url()
      .max(2048)
      .refine((s) => /^https?:\/\//.test(s), 'Use an http or https URL.'),
  ]),
  price: nullableMoney,
});
export const inputs = {
  context: z.object({}),
  group: z.object({ group_id }),
  exchange: z.object({ exchange_id }),
  // the name is optional and defaults to the server's name in Discord
  activate_group: z.object({ guild_id: snowflake, name: name.max(80).optional() }),
  member_save: z.object({
    group_id,
    discord_id: snowflake,
    display_name: name.max(100),
    role: z.enum(['member', 'admin']).optional(),
    active: z.boolean().optional(),
  }),
  past_member_add: z.object({
    group_id,
    display_name: name.max(100),
    discord_id: z.union([z.literal(''), snowflake]).optional(),
  }),
  exchange_create: exchangeInput,
  participants_set: z.object({ exchange_id, members: z.array(uuid).max(200) }),
  history_import: z.object({ group_id, after: uuid.nullable(), ...pastYear }),
  history_correct: z.object({ exchange_id, acknowledge: z.literal(true), ...pastYear }),
  generate: z.object({ exchange_id }),
  finalize: z.object({ exchange_id, candidate_created_at: z.iso.datetime({ offset: true }) }),
  chain: z.object({
    exchange_id,
    count: z.number().int().min(1).max(200),
    start: uuid.optional(),
    acknowledge: z.boolean().optional(),
    acknowledgeFull: z.boolean().optional(),
    candidate_created_at: z.iso.datetime({ offset: true }).optional(),
  }),
  exchange_status: z.object({ exchange_id, status: z.literal('completed') }),
  exchange_delete: z.object({ exchange_id, confirm_name: z.string().min(1).max(100) }),
  wishlist: z.object({}),
  wishlist_save: wishlistInput,
  wishlist_delete: z.object({ id: uuid }),
  wishlist_reorder: z.object({ ids: z.array(uuid).max(100) }),
  notifications_queue: z.object({ exchange_id }),
  notifications_retry: z.object({ exchange_id, acknowledge: z.literal(true) }),
  notifications_process: z.object({ exchange_id }),
  notifications_send: z.object({ exchange_id }),
  notifications_status: z.object({ exchange_id }),
  wishlist_status: z.object({ exchange_id }),
  wishlist_remind: z.object({ exchange_id }),
  discord_members: z.object({
    group_id,
    query: z.string().max(100).optional(),
    after: snowflake.optional(),
  }),
  claim_owner: z.object({ secret: z.string().min(1).max(512) }),
};
export type Operation = keyof typeof inputs;
export type Input<K extends Operation> = z.infer<(typeof inputs)[K]>;
export type Command = { [K in Operation]: { operation: K; payload: Input<K> } }[Operation];
export function parseCommand(value: unknown): Command {
  const envelope = z
    .object({
      operation: z.enum(Object.keys(inputs) as [Operation, ...Operation[]]),
      payload: z.unknown().default({}),
    })
    .parse(value);
  const operation = envelope.operation;
  return { operation, payload: inputs[operation].parse(envelope.payload) } as Command;
}
