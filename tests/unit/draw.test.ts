/**
 * Description:  Tests the draw solver, the repeat rules and draw validation.
 * Author:       Alex Wu
 * Dependencies: vitest, domain/draw.ts
 * Usage:        npm test
 */
import { describe, it, expect } from 'vitest';
import { generateDraw, validateDraw, restrictedHistory, type HistoryPair } from '@/domain/draw';
const ids = ['a', 'b', 'c', 'd', 'e'];
const options = { mode: 'strict' as const };
const history: HistoryPair[] = ids.map((giver, i) => ({
  giver,
  recipient: ids[(i + 1) % ids.length],
  exchange: 'old',
  order: 1,
}));
describe('single circle generator', () => {
  it('rejects disconnected feasible permutations and discloses unproven minimize results', () => {
    const people = ['a', 'b', 'c', 'd'];
    const only = new Set(['ab', 'ba', 'cd', 'dc']);
    const blocked = people.flatMap((giver) =>
      people
        .filter((recipient) => giver !== recipient && !only.has(giver + recipient))
        .map((recipient) => ({ giver, recipient, exchange: 'past', order: 1 })),
    );
    expect(() => generateDraw(people, blocked, options)).toThrow('No single circle');
    const h = ['b', 'c'].map((recipient) => ({
      giver: 'a',
      recipient,
      exchange: 'past',
      order: 1,
    }));
    const result = generateDraw(['a', 'b', 'c'], h, {
      mode: 'minimize',
      maxNodes: 3,
      random: () => 0.5,
    });
    expect(result.report.valid).toBe(true);
    expect(result.optimal).toBe(false);
  });
  it('generates valid circles across sizes and random runs', () => {
    for (let n = 2; n <= 80; n++) {
      const members = Array.from({ length: n }, (_, i) => String(i));
      const draw = generateDraw(members, [], options);
      expect(draw.report.valid).toBe(true);
      expect(draw.report.cycles).toBe(1);
    }
  });
  it('never repeats restricted pairs', () => {
    for (let i = 0; i < 40; i++)
      expect(generateDraw(ids, history, options).report.historicalRepeats).toBe(0);
  });
  it('rejects duplicate, empty and one-participant inputs', () => {
    for (const list of [[], ['a'], ['a', 'a'], ['', 'b']])
      expect(() => generateDraw(list, [], options)).toThrow();
  });
  it('reports impossible strict draws without relaxation', () => {
    expect(() =>
      generateDraw(['a', 'b'], [{ giver: 'a', recipient: 'b', exchange: 'x', order: 1 }], options),
    ).toThrow('No single circle');
  });
  it('distinguishes computation exhaustion from proven impossibility', () => {
    expect(() => generateDraw(ids, [], { ...options, maxNodes: 1 })).toThrow('Search budget');
  });
  it('detects multiple cycles, missing, unknown and duplicate recipients', () => {
    expect(
      validateDraw(
        ['a', 'b', 'c', 'd'],
        [
          { giver: 'a', recipient: 'b' },
          { giver: 'b', recipient: 'a' },
          { giver: 'c', recipient: 'd' },
          { giver: 'd', recipient: 'c' },
        ],
      ),
    ).toMatchObject({ valid: false, cycles: 2 });
    expect(
      validateDraw(ids, [
        { giver: 'a', recipient: 'a' },
        { giver: 'b', recipient: 'a' },
        { giver: 'x', recipient: 'c' },
      ]),
    ).toMatchObject({
      valid: false,
      selfAssignments: 1,
      duplicateRecipients: 1,
      unknownParticipants: 1,
    });
    expect(validateDraw(['a', 'a'], [{ giver: 'a', recipient: 'a' }]).valid).toBe(false);
  });
  it('keeps only the latest exchanges in recent mode, including partial history', () => {
    const h = [...history, { giver: 'b', recipient: 'a', exchange: 'new', order: 2 }];
    expect(restrictedHistory(h, { mode: 'recent', recentCount: 1 })).toHaveLength(1);
    expect(restrictedHistory(h, { mode: 'recent', recentCount: 2 })).toHaveLength(h.length);
  });
  it('minimizes repeat count then prefers older repeats', () => {
    const h: HistoryPair[] = [
      { giver: 'a', recipient: 'b', exchange: 'old', order: 1 },
      { giver: 'a', recipient: 'c', exchange: 'new', order: 2 },
    ];
    const draw = generateDraw(['a', 'b', 'c'], h, { mode: 'minimize' });
    expect(draw.pairs).toContainEqual({ giver: 'a', recipient: 'b' });
    expect(draw.optimal).toBe(true);
  });
  it('finds the true minimum for exhaustive small graphs', () => {
    for (let run = 0; run < 25; run++) {
      const h = ids.flatMap((a) =>
        ids
          .filter((b) => a !== b && Math.random() < 0.6)
          .map((b) => ({ giver: a, recipient: b, exchange: 'h', order: 1 })),
      );
      const draw = generateDraw(ids, h, { mode: 'minimize', maxNodes: 10000 });
      let minimum = Infinity;
      function permutations(path: string[], left: string[]) {
        if (!left.length) {
          const pairs = path.map((giver, i) => ({ giver, recipient: path[(i + 1) % path.length] }));
          minimum = Math.min(minimum, validateDraw(ids, pairs, h).historicalRepeats);
          return;
        }
        for (const id of left)
          permutations(
            [...path, id],
            left.filter((x) => x !== id),
          );
      }
      permutations(['a'], ids.slice(1));
      expect(draw.report.historicalRepeats).toBe(minimum);
    }
  });
});
