/**
 * Description:  Tests the past-year check and the weighted snowflake picker.
 * Author:       Alex Wu
 * Dependencies: vitest, domain/history.ts, components/snowflakes.ts
 * Usage:        npm test
 */
import { describe, expect, it } from 'vitest';
import { checkPastYear } from '@/domain/history';
import { pickDesign, SNOWFLAKES } from '@/components/snowflakes';
const people = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase() }));
describe('past year check', () => {
  it('reports a complete single circle', () => {
    expect(checkPastYear(people, { a: 'b', b: 'c', c: 'a' }).state).toBe('complete');
  });
  it('reports partial records with the known count', () => {
    expect(checkPastYear(people, { a: 'b' })).toMatchObject({ state: 'partial', known: 1 });
  });
  it('names a recipient chosen twice', () => {
    const result = checkPastYear(people, { a: 'c', b: 'c' });
    expect(result).toMatchObject({ state: 'error', repeatedRecipients: ['c'] });
    expect(result.message).toContain('C is chosen');
  });
  it('rejects two separate circles and self matches', () => {
    const four = [...people, { id: 'd', name: 'D' }];
    expect(checkPastYear(four, { a: 'b', b: 'a', c: 'd', d: 'c' }).message).toContain(
      'more than one circle',
    );
    expect(checkPastYear(people, { a: 'a' }).message).toContain('themselves');
  });
});
describe('snowflake library', () => {
  it('picks designs in proportion to their chance', () => {
    expect(pickDesign(0).id).toBe('dot');
    expect(pickDesign(0.69).id).toBe('dot');
    expect(pickDesign(0.71).id).toBe('simple');
    expect(pickDesign(0.99).id).toBe('crystal');
  });
  it('treats chances as relative weights', () => {
    const designs = [
      { ...SNOWFLAKES[0], chance: 3 },
      { ...SNOWFLAKES[1], chance: 1 },
    ];
    expect(pickDesign(0.74, designs).id).toBe('dot');
    expect(pickDesign(0.76, designs).id).toBe('simple');
  });
});
