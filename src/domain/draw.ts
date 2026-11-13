/**
 * Description:  Draw solver that forms one gift circle while following a repeat rule, plus the
 *               check that a set of matches is valid. IDs are plain strings.
 * Author:       Alex Wu
 * Dependencies:
 * Usage:
 */
export type Pair = { giver: string; recipient: string };
export type HistoryPair = Pair & { exchange: string; order: number };
export type DrawMode = 'strict' | 'recent' | 'minimize';
export type DrawOptions = {
  mode: DrawMode;
  recentCount?: number;
  maxNodes?: number;
  maxMilliseconds?: number;
  random?: () => number;
  now?: () => number;
};
export type Validation = {
  participantCount: number;
  assignmentCount: number;
  cycles: number;
  historicalRepeats: number;
  selfAssignments: number;
  missingAssignments: number;
  duplicateGivers: number;
  duplicateRecipients: number;
  unknownParticipants: number;
  valid: boolean;
};
export class DrawError extends Error {
  constructor(
    public code: 'INPUT' | 'IMPOSSIBLE' | 'LIMIT',
    message: string,
  ) {
    super(message);
  }
}
const edge = (a: string, b: string) => JSON.stringify([a, b]);

export function restrictedHistory(history: HistoryPair[], options: DrawOptions): HistoryPair[] {
  if (options.mode !== 'recent') return history;
  const n = options.recentCount ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 100)
    throw new DrawError('INPUT', 'Recent history must be between 1 and 100.');
  const latest = [...new Map(history.map((h) => [h.exchange, h.order])).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
  return history.filter((h) => latest.includes(h.exchange));
}

export function validateDraw(
  participants: string[],
  pairs: Pair[],
  history: Pair[] = [],
): Validation {
  const ids = new Set(participants),
    givers = new Set(pairs.map((p) => p.giver)),
    recipients = new Set(pairs.map((p) => p.recipient));
  const past = new Set(history.map((p) => edge(p.giver, p.recipient)));
  const mapping = new Map(pairs.map((p) => [p.giver, p.recipient]));
  const visited = new Set<string>();
  let cycles = 0;
  for (const id of ids) {
    if (visited.has(id)) continue;
    const path = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor !== undefined && ids.has(cursor) && !visited.has(cursor) && !path.has(cursor)) {
      path.add(cursor);
      cursor = mapping.get(cursor);
    }
    if (cursor !== undefined && path.has(cursor)) cycles++;
    path.forEach((p) => visited.add(p));
  }
  const report: Validation = {
    participantCount: participants.length,
    assignmentCount: pairs.length,
    cycles,
    historicalRepeats: pairs.filter((p) => past.has(edge(p.giver, p.recipient))).length,
    selfAssignments: pairs.filter((p) => p.giver === p.recipient).length,
    missingAssignments: participants.filter((id) => !givers.has(id) || !recipients.has(id)).length,
    duplicateGivers: pairs.length - givers.size,
    duplicateRecipients: pairs.length - recipients.size,
    unknownParticipants: pairs.filter((p) => !ids.has(p.giver) || !ids.has(p.recipient)).length,
    valid: false,
  };
  report.valid =
    participants.length >= 2 &&
    ids.size === participants.length &&
    pairs.length === participants.length &&
    cycles === 1 &&
    report.selfAssignments === 0 &&
    report.missingAssignments === 0 &&
    report.duplicateGivers === 0 &&
    report.duplicateRecipients === 0 &&
    report.unknownParticipants === 0;
  return report;
}

export function generateDraw(participants: string[], history: HistoryPair[], options: DrawOptions) {
  if (
    participants.length < 2 ||
    participants.length > 200 ||
    new Set(participants).size !== participants.length ||
    participants.some((p) => !p)
  )
    throw new DrawError('INPUT', 'Select between 2 and 200 distinct participants.');
  const random = options.random ?? Math.random,
    maxNodes = options.maxNodes ?? 250_000;
  const now = options.now ?? (() => performance.now()),
    deadline = now() + (options.maxMilliseconds ?? 3000);
  if (!Number.isInteger(maxNodes) || maxNodes < 1)
    throw new DrawError('INPUT', 'Invalid computation budget.');
  const restricted = new Set(
    restrictedHistory(history, options).map((p) => edge(p.giver, p.recipient)),
  );
  const allHistory = new Set(history.map((p) => edge(p.giver, p.recipient)));
  const orders = [...new Set(history.map((h) => h.order))].sort((a, b) => a - b);
  const recency = new Map<string, number>();
  history.forEach((h) =>
    recency.set(
      edge(h.giver, h.recipient),
      Math.max(recency.get(edge(h.giver, h.recipient)) ?? 0, orders.indexOf(h.order) + 1),
    ),
  );
  // one repeated match always costs more than every possible age penalty combined
  const repeatWeight = participants.length * (orders.length + 1) + 1;
  const cost = (a: string, b: string) =>
    allHistory.has(edge(a, b)) ? repeatWeight + (recency.get(edge(a, b)) ?? 0) : 0;
  const allowed = (a: string, b: string) =>
    a !== b && (options.mode === 'minimize' || !restricted.has(edge(a, b)));
  const start = participants[0],
    path = [start],
    remaining = new Set(participants.slice(1));
  let best: string[] | undefined,
    bestCost = Infinity,
    nodes = 0,
    limited = false;
  function search(score: number) {
    if (++nodes > maxNodes || now() > deadline) {
      limited = true;
      return;
    }
    if (score >= bestCost) return;
    const current = path[path.length - 1];
    if (!remaining.size) {
      if (!allowed(current, start)) return;
      const total = score + (options.mode === 'minimize' ? cost(current, start) : 0);
      if (total < bestCost) {
        bestCost = total;
        best = [...path];
      }
      return;
    }
    const choices = [...remaining]
      .filter((next) => allowed(current, next))
      .map((id) => ({
        id,
        tie: random(),
        cost: options.mode === 'minimize' ? cost(current, id) : 0,
      }))
      .sort((a, b) => a.cost - b.cost || a.tie - b.tie);
    for (const next of choices) {
      if (bestCost === 0 || limited) break;
      remaining.delete(next.id);
      path.push(next.id);
      // make sure every remaining person can still give to someone left or back to the start
      const feasible = [...remaining].every(
        (id) => allowed(id, start) || [...remaining].some((other) => allowed(id, other)),
      );
      if (feasible) search(score + next.cost);
      path.pop();
      remaining.add(next.id);
    }
  }
  search(0);
  if (!best)
    throw new DrawError(
      limited ? 'LIMIT' : 'IMPOSSIBLE',
      limited
        ? 'Search budget exhausted. Try again or change restrictions.'
        : 'No single circle satisfies these restrictions.',
    );
  const pairs = best.map((giver, i) => ({ giver, recipient: best![(i + 1) % best!.length] }));
  const report = validateDraw(participants, pairs, history);
  if (!report.valid) throw new Error('Internal draw validation failed.');
  return { pairs, report, optimal: !limited || bestCost === 0, nodes };
}
