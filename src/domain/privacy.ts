/**
 * Description:  Reveals only the requested part of a match circle for the "Check matches" tool.
 * Author:       Alex Wu
 * Dependencies: domain/draw.ts
 * Usage:
 */
import type { Pair } from './draw';
export class AccessError extends Error {}
export function inspectChain(input: {
  pairs: Pair[];
  admin: boolean;
  ownMemberId?: string;
  start?: string;
  count: number;
  acknowledge?: boolean;
  acknowledgeFull?: boolean;
}): Pair[] {
  if (!input.admin) throw new AccessError('Group administrator access required.');
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > input.pairs.length)
    throw new AccessError('Invalid reveal count.');
  const start = input.ownMemberId ?? input.start;
  if (!input.ownMemberId && (!input.acknowledge || !start))
    throw new AccessError('Select a participant and acknowledge the spoiler warning.');
  if (input.ownMemberId && input.start && input.start !== input.ownMemberId)
    throw new AccessError('Participating administrators must start at themselves.');
  if (input.count === input.pairs.length && !input.acknowledgeFull)
    throw new AccessError('Confirm before revealing the complete circle.');
  const result: Pair[] = [];
  let cursor = start;
  for (let i = 0; i < input.count; i++) {
    const pair = input.pairs.find((p) => p.giver === cursor);
    if (!pair) throw new AccessError('Participant is not in this exchange.');
    result.push(pair);
    cursor = pair.recipient;
  }
  return result;
}
