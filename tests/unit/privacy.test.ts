/**
 * Description:  Tests the "Check matches" reveal rules.
 * Author:       Alex Wu
 * Dependencies: vitest, domain/privacy.ts
 * Usage:        npm test
 */
import { expect, it } from 'vitest';
import { inspectChain } from '@/domain/privacy';
const pairs = [
  { giver: 'a', recipient: 'b' },
  { giver: 'b', recipient: 'c' },
  { giver: 'c', recipient: 'a' },
];
it('returns only requested edges, starting at the participating admin', () => {
  expect(inspectChain({ pairs, admin: true, ownMemberId: 'a', count: 1 })).toEqual([pairs[0]]);
  expect(inspectChain({ pairs, admin: true, ownMemberId: 'a', count: 2 })).toHaveLength(2);
});
it('denies ordinary members, arbitrary starts, nonparticipant unacknowledged and full reveals', () => {
  for (const input of [
    { admin: false, ownMemberId: 'a', count: 1 },
    { admin: true, ownMemberId: 'a', start: 'b', count: 1 },
    { admin: true, start: 'b', count: 1 },
    { admin: true, ownMemberId: 'a', count: 3 },
    { admin: true, ownMemberId: 'a', count: 99 },
  ])
    expect(() => inspectChain({ pairs, ...input })).toThrow();
  expect(inspectChain({ pairs, admin: true, start: 'b', count: 1, acknowledge: true })).toEqual([
    pairs[1],
  ]);
  expect(
    inspectChain({ pairs, admin: true, ownMemberId: 'a', count: 3, acknowledgeFull: true }),
  ).toHaveLength(3);
});
