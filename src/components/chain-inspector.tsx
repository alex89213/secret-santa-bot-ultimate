/**
 * Description:  "Check matches" card. Shows only the requested part of the match circle, one step
 *               at a time, and hides it again on request.
 * Author:       Alex Wu
 * Dependencies: react, domain/types.ts, domain/draw.ts, components/api.ts, components/feedback.tsx
 * Usage:
 */
'use client';
import { useRef, useState, useEffect } from 'react';
import type { ExchangeDetail } from '@/domain/types';
import type { Pair } from '@/domain/draw';
import { api } from './api';
import { Feedback } from './feedback';
/**
 * Shows the "Check matches" card. The server returns only the requested matches, and hiding them
 * clears them from the page.
 */
export function ChainInspector({ data }: { data: ExchangeDetail }) {
  const [open, setOpen] = useState(false),
    [pairs, setPairs] = useState<Pair[]>([]),
    [count, setCount] = useState(1),
    [start, setStart] = useState(data.own_member_id ?? ''),
    [ack, setAck] = useState(false),
    [fullAck, setFullAck] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const draft = data.exchange.status === 'draft',
    size = data.participants.length,
    participating = Boolean(data.own_member_id);
  const name = (id: string) =>
    id === data.own_member_id
      ? 'You'
      : (data.participants.find((p) => p.id === id)?.display_name ?? 'Someone');
  async function reveal(n: number) {
    if (n === size && !fullAck) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ connections: Pair[] }>(
        'chain',
        {
          exchange_id: data.exchange.id,
          count: n,
          ...(!participating ? { start, acknowledge: ack } : {}),
          acknowledgeFull: fullAck,
          ...(draft ? { candidate_created_at: data.validation?.created_at } : {}),
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setPairs(result.connections);
        setCount(n);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Couldn’t check the matches.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function hide() {
    pending.current?.abort();
    setOpen(false);
    setPairs([]);
    setCount(1);
    setAck(false);
    setFullAck(false);
    setBusy(false);
    setError('');
  }
  const blocked = !participating && (!start || !ack);
  return (
    <section className="card" aria-label="Check matches">
      <h2 className="card-title">Check matches</h2>
      <p className="muted">
        {draft
          ? 'Look at part of this draw before locking it in. Nobody is messaged.'
          : 'Look at part of the locked-in matches.'}{' '}
        {participating ? 'You start with your own match.' : ''}
      </p>
      {size === 2 && <p className="meta">With two people, one match shows the whole circle.</p>}
      {!open ? (
        <button
          className="btn secondary"
          style={{ justifySelf: 'start' }}
          onClick={() => {
            setOpen(true);
            if (participating) void reveal(1);
          }}
        >
          {participating ? 'Show my match' : 'Check matches'}
        </button>
      ) : (
        <>
          {!participating && (
            <>
              <label className="field">
                <span>Start from</span>
                <select
                  value={start}
                  onChange={(e) => {
                    pending.current?.abort();
                    setBusy(false);
                    setStart(e.target.value);
                    setPairs([]);
                    setFullAck(false);
                  }}
                >
                  <option value="">Pick a person</option>
                  {data.participants.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="choice">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I
                understand this shows who other people are giving to.
              </label>
            </>
          )}
          <div className="chain" aria-live="polite">
            {pairs.length ? (
              <>
                <span>{name(pairs[0].giver)}</span>
                {pairs.map((p, i) => (
                  <span key={i} className="row" style={{ gap: 8 }}>
                    <span className="arrow" aria-label="gives to">
                      →
                    </span>
                    <span>{name(p.recipient)}</span>
                  </span>
                ))}
              </>
            ) : (
              <span className="muted">Nothing shown yet.</span>
            )}
          </div>
          <label className="field">
            <span>
              How many matches to show <span className="hint">· 1 to {size}</span>
            </span>
            <input
              type="number"
              min={1}
              max={size}
              value={count}
              style={{ width: 100 }}
              onChange={(e) => {
                setCount(Number(e.target.value));
                setFullAck(false);
              }}
            />
          </label>
          {count === size && (
            <label className="choice">
              <input
                type="checkbox"
                checked={fullAck}
                onChange={(e) => setFullAck(e.target.checked)}
              />
              Show the whole circle. I understand this reveals every match.
            </label>
          )}
          <div className="row">
            <button
              className="btn primary"
              disabled={
                busy ||
                blocked ||
                (count === size && !fullAck) ||
                !Number.isInteger(count) ||
                count < 1 ||
                count > size
              }
              onClick={() => void reveal(count)}
            >
              Show {count}
            </button>
            {count < size - 1 && (
              <button
                className="btn secondary"
                disabled={busy || blocked}
                onClick={() => void reveal(count + 1)}
              >
                One more
              </button>
            )}
            <button className="btn quiet" onClick={hide}>
              Hide matches
            </button>
          </div>
          <Feedback error={error} />
        </>
      )}
    </section>
  );
}
