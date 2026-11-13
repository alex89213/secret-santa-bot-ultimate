/**
 * Description:  Checks a past year's known matches as they are entered and says whether the year is
 *               complete, partial or has a problem.
 * Author:       Alex Wu
 * Dependencies:
 * Usage:
 */
export type PastYearCheck =
  | { state: 'complete'; message: string }
  | { state: 'partial'; message: string; known: number }
  | { state: 'error'; message: string; repeatedRecipients: string[] };
/** Checks a past year's people and known matches. IDs are member record ids. */
export function checkPastYear(
  people: { id: string; name: string }[],
  gives: Record<string, string | undefined>,
): PastYearCheck {
  const ids = new Set(people.map((p) => p.id));
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone';
  if (people.length < 2)
    return { state: 'error', message: 'Pick at least two people.', repeatedRecipients: [] };
  const known = people.filter((p) => gives[p.id] && ids.has(gives[p.id]!));
  if (known.some((p) => gives[p.id] === p.id))
    return { state: 'error', message: 'Nobody can give to themselves.', repeatedRecipients: [] };
  const counts = new Map<string, number>();
  known.forEach((p) => counts.set(gives[p.id]!, (counts.get(gives[p.id]!) ?? 0) + 1));
  const repeated = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  if (repeated.length) {
    const names = repeated.map(name).join(' and ');
    return {
      state: 'error',
      message: `${names} ${repeated.length > 1 ? 'are' : 'is'} chosen as a recipient more than once.`,
      repeatedRecipients: repeated,
    };
  }
  if (!known.length)
    return { state: 'partial', message: 'Add at least one known match.', known: 0 };
  if (known.length < people.length)
    return {
      state: 'partial',
      known: known.length,
      message: `Partial: ${known.length} of ${people.length} matches known. Known matches still count when avoiding repeats.`,
    };
  const seen = new Set<string>();
  let cursor = people[0].id;
  while (!seen.has(cursor)) {
    seen.add(cursor);
    cursor = gives[cursor]!;
  }
  return seen.size === people.length
    ? { state: 'complete', message: `Complete: one circle of ${people.length} people.` }
    : {
        state: 'error',
        message: `These matches form more than one circle. A complete year needs one circle through all ${people.length} people.`,
        repeatedRecipients: [],
      };
}
