/**
 * Description:  Admin tools on an exchange page: progress steps, picking people, drawing names,
 *               locking in, checking matches and sending them.
 * Author:       Alex Wu
 * Dependencies: react, next, domain/types.ts, components/api.ts, components/feedback.tsx,
 *               components/confirm.tsx, components/delete-exchange.tsx,
 *               components/chain-inspector.tsx, components/exchange-notifications.tsx,
 *               components/past-year-editor.tsx
 * Usage:
 */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Exchange, ExchangeDetail, Member, WishlistStatus } from '@/domain/types';
import { api, useAction } from './api';
import { Feedback } from './feedback';
import { ConfirmButton } from './confirm';
import { DeleteExchange } from './delete-exchange';
import { ChainInspector } from './chain-inspector';
import { ExchangeNotifications } from './exchange-notifications';
import { PastYearEditor } from './past-year-editor';
import { WishlistReminder } from './wishlist-reminder';
const STEPS = ['Pick people', 'Draw names', 'Lock in matches', 'Send matches'];
const repeatText = (n: number) => (n === 1 ? '1 match repeats' : `${n} matches repeat`);
function currentStep(data: ExchangeDetail) {
  const { exchange: e } = data;
  if (e.status !== 'draft') {
    const sent = data.deliveries.length > 0 && data.deliveries.every((d) => d.status === 'sent');
    return sent ? 4 : 3;
  }
  if (data.candidate_available) return 2;
  return data.participants.length >= 2 ? 1 : 0;
}
export function ExchangeAdmin({
  data,
  members,
  exchanges,
  wishlists,
}: {
  data: ExchangeDetail;
  members: Member[];
  exchanges: Exchange[];
  /** Wishlist status for a running exchange, or null once it's done. */
  wishlists?: WishlistStatus | null;
}) {
  const { exchange: e } = data;
  if (e.historical) return <PastYearAdmin data={data} members={members} exchanges={exchanges} />;
  const step = currentStep(data);
  const matched = ['finalized', 'completed'].includes(e.status);
  const drawVersion = [e.status, e.revision, data.validation?.created_at ?? ''].join(':');
  return (
    <section className="stack loose" aria-label="Exchange administration">
      <ol className="steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'now' : undefined}>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      {e.status === 'draft' ? (
        <div className="grid-lead">
          <DrawCard data={data} />
          <PeoplePicker data={data} members={members} />
        </div>
      ) : (
        <div className="grid-2">
          <div className="stack loose">
            <ChainInspector key={drawVersion} data={data} />
            {wishlists && <WishlistReminder exchangeId={e.id} status={wishlists} />}
          </div>
          {matched && <ExchangeNotifications key={e.id} data={data} />}
        </div>
      )}
      {e.status === 'draft' && data.candidate_available && (
        <ChainInspector key={drawVersion} data={data} />
      )}
      {e.status === 'draft' && wishlists && (
        <WishlistReminder exchangeId={e.id} status={wishlists} />
      )}
      <Lifecycle exchange={e} />
      <DeleteExchange exchange={e} />
    </section>
  );
}
function DrawCard({ data }: { data: ExchangeDetail }) {
  const router = useRouter(),
    action = useAction();
  const { exchange: e } = data,
    report = data.validation?.report;
  const run = async (fn: () => Promise<unknown>, message: string) => {
    await action.run(fn, message);
    router.refresh();
  };
  return (
    <section className="card">
      <div className="row between">
        <h2 className="card-title">{data.candidate_available ? 'Draw ready' : 'Draw names'}</h2>
      </div>
      {data.candidate_available && report ? (
        <>
          <p className={`check-line ${report.valid ? '' : 'warn'}`}>
            <i aria-hidden="true">{report.valid ? '✓' : '!'}</i>
            <span>
              {!report.valid
                ? 'This draw didn’t pass its checks. Redraw before locking in.'
                : report.historicalRepeats === 0
                  ? 'Everyone gives and gets one gift, with no repeats from past years.'
                  : `Everyone gives and gets one gift. ${repeatText(report.historicalRepeats)} ${
                      e.mode === 'recent'
                        ? 'an older year, which this repeat rule allows.'
                        : data.validation?.optimal === false
                          ? 'a past year, the fewest found in the time available.'
                          : 'a past year, the fewest possible.'
                    }`}
            </span>
          </p>
          <p className="meta">
            Locking in is permanent. Nobody is messaged until you send matches.
          </p>
        </>
      ) : (
        <p className="muted">
          {data.participants.length < 2
            ? 'Pick at least two people, then draw names.'
            : `Draw names for ${data.participants.length} people. You can check the draw before locking it in.`}
        </p>
      )}
      <div className="row">
        {data.candidate_available && (
          <ConfirmButton
            className="btn primary"
            label="Lock in matches"
            title="Lock in these matches?"
            body={
              <>
                <p>
                  Matches can’t be changed after this. Everyone can see their own match on the site.
                </p>
                <p>Discord DMs go out only when you choose Send matches.</p>
              </>
            }
            confirmLabel="Lock in"
            disabled={action.busy || !report?.valid}
            onConfirm={() =>
              run(
                () =>
                  api('finalize', {
                    exchange_id: e.id,
                    candidate_created_at: data.validation?.created_at,
                  }),
                'Matches locked in.',
              )
            }
          />
        )}
        <button
          className={data.candidate_available ? 'btn secondary' : 'btn primary'}
          disabled={action.busy || data.participants.length < 2}
          onClick={() => void run(() => api('generate', { exchange_id: e.id }), '')}
        >
          {action.busy ? 'Drawing…' : data.candidate_available ? 'Redraw' : 'Draw names'}
        </button>
      </div>
      <Feedback {...action} />
    </section>
  );
}
function PeoplePicker({ data, members }: { data: ExchangeDetail; members: Member[] }) {
  const router = useRouter(),
    action = useAction();
  const saved = data.participants.map((p) => p.id);
  const [selected, setSelected] = useState(saved);
  const eligible = members.filter((m) => m.active);
  const changed = selected.length !== saved.length || selected.some((id) => !saved.includes(id));
  return (
    <section className="stack">
      <div className="row between">
        <h2 className="section-title">
          People <span className="meta">· {selected.length}</span>
        </h2>
        <span className="row">
          <button
            className="btn quiet small"
            onClick={() => setSelected(eligible.map((m) => m.id))}
          >
            Everyone
          </button>
          <button className="btn quiet small" onClick={() => setSelected([])}>
            Nobody
          </button>
        </span>
      </div>
      <div className="checklist">
        {eligible.map((m) => (
          <label className="choice" key={m.id}>
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={(ev) =>
                setSelected(
                  ev.target.checked ? [...selected, m.id] : selected.filter((id) => id !== m.id),
                )
              }
            />
            {m.display_name}
          </label>
        ))}
      </div>
      {changed && (
        <div className="row">
          <button
            className="btn primary"
            disabled={action.busy}
            onClick={async () => {
              await action.run(
                () => api('participants_set', { exchange_id: data.exchange.id, members: selected }),
                data.candidate_available ? 'Saved. Draw names again for the new group.' : 'Saved.',
              );
              router.refresh();
            }}
          >
            Save people
          </button>
          <button className="btn secondary" onClick={() => setSelected(saved)}>
            Undo
          </button>
        </div>
      )}
      <Feedback {...action} />
    </section>
  );
}
function Lifecycle({ exchange: e }: { exchange: Exchange }) {
  const router = useRouter(),
    action = useAction();
  if (e.status !== 'finalized') return null;
  return (
    <div className="row">
      <ConfirmButton
        label="Mark as done"
        title="Mark this exchange as done?"
        body={<p>Use this once the gifts have been exchanged. Matches stay visible.</p>}
        confirmLabel="Mark as done"
        disabled={action.busy}
        onConfirm={async () => {
          await action.run(
            () => api('exchange_status', { exchange_id: e.id, status: 'completed' }),
            'Marked as done.',
          );
          router.refresh();
        }}
      />
      <Feedback {...action} />
    </div>
  );
}
function PastYearAdmin({
  data,
  members,
  exchanges,
}: {
  data: ExchangeDetail;
  members: Member[];
  exchanges: Exchange[];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="stack loose" aria-label="Past year administration">
      {editing ? (
        <PastYearEditor
          groupId={data.exchange.group_id}
          members={members}
          exchanges={exchanges}
          existing={{
            id: data.exchange.id,
            name: data.exchange.name,
            participantIds: data.participants.map((p) => p.id),
          }}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="row">
          <button className="btn secondary" onClick={() => setEditing(true)}>
            Edit this year
          </button>
        </div>
      )}
      <DeleteExchange exchange={data.exchange} />
    </section>
  );
}
