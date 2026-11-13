/**
 * Description:  Admin tabs on a server page for exchanges, people and past years.
 * Author:       Alex Wu
 * Dependencies: react, next, domain/types.ts, components/ui.tsx, components/api.ts,
 *               components/feedback.tsx, components/discord-member-picker.tsx,
 *               components/past-year-editor.tsx
 * Usage:
 */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupDetail } from '@/domain/types';
import { ExchangeList, Empty } from './ui';
import { api, useAction, formValues } from './api';
import { Feedback } from './feedback';
import { DiscordMemberPicker } from './discord-member-picker';
import { PastYearEditor } from './past-year-editor';
import { CURRENCIES, currencyLabel } from '@/domain/money';
const TABS = [
  { id: 'exchanges', label: 'Exchanges' },
  { id: 'people', label: 'People' },
  { id: 'history', label: 'History' },
] as const;
type Tab = (typeof TABS)[number]['id'];
export function GroupAdmin({ data, owner }: { data: GroupDetail; owner: boolean }) {
  const [tab, setTab] = useState<Tab>('exchanges');
  return (
    <>
      <div className="subtabs" role="tablist" aria-label="Server sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="stack loose"
      >
        {tab === 'exchanges' && <Exchanges data={data} />}
        {tab === 'people' && <People data={data} owner={owner} />}
        {tab === 'history' && <History data={data} />}
      </div>
    </>
  );
}
function Exchanges({ data }: { data: GroupDetail }) {
  const router = useRouter(),
    save = useAction(),
    [creating, setCreating] = useState(false),
    [mode, setMode] = useState('strict');
  const live = data.exchanges.filter((e) => !e.historical);
  if (creating)
    return (
      <section className="card">
        <h2 className="section-title">New exchange</h2>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = formValues(e.currentTarget);
            const result = await save.run(
              () =>
                api<{ id: string }>('exchange_create', {
                  group_id: data.group.id,
                  name: v.name,
                  budget: v.budget === '' ? null : Number(v.budget),
                  currency: v.currency,
                  mode,
                  recent_count: Number(v.recent_count) || 1,
                }),
              'Exchange created.',
            );
            if (result) {
              router.push(`/exchanges/${result.id}`);
              router.refresh();
            }
          }}
        >
          <label className="field">
            <span>Name</span>
            <input id="exchange-name" name="name" required maxLength={100} autoFocus />
          </label>
          <div className="field">
            <span>
              Gift budget <span className="hint">· optional</span>
            </span>
            <div className="inline-fields">
              <input
                id="exchange-budget"
                name="budget"
                type="number"
                min="0"
                max="99999999"
                step="0.01"
                aria-label="Budget amount"
              />
              <select
                id="exchange-currency"
                name="currency"
                defaultValue="USD"
                aria-label="Currency"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {currencyLabel(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="field">
            <legend>Repeat rule</legend>
            <label className="choice">
              <input
                type="radio"
                name="mode"
                value="strict"
                checked={mode === 'strict'}
                onChange={() => setMode('strict')}
              />
              Never repeat a past match
            </label>
            <label className="choice">
              <input
                type="radio"
                name="mode"
                value="recent"
                checked={mode === 'recent'}
                onChange={() => setMode('recent')}
              />
              Avoid matches from the last
              <input
                id="exchange-recent-count"
                name="recent_count"
                type="number"
                min="1"
                max="100"
                defaultValue={2}
                aria-label="Number of exchanges"
                onFocus={() => setMode('recent')}
              />
              exchanges
            </label>
            <label className="choice">
              <input
                type="radio"
                name="mode"
                value="minimize"
                checked={mode === 'minimize'}
                onChange={() => setMode('minimize')}
              />
              Allow repeats if there’s no other way
            </label>
          </fieldset>
          <div className="row">
            <button disabled={save.busy} className="btn primary">
              Create exchange
            </button>
            <button type="button" className="btn secondary" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
          <Feedback {...save} />
        </form>
      </section>
    );
  return (
    <>
      <div className="row between">
        <h2 className="section-title">Exchanges</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>
          New exchange
        </button>
      </div>
      {live.length ? (
        <ExchangeList exchanges={live} />
      ) : (
        <Empty title="No exchanges yet">Create one, pick who’s taking part, then draw names.</Empty>
      )}
    </>
  );
}
function People({ data, owner }: { data: GroupDetail; owner: boolean }) {
  const router = useRouter(),
    save = useAction();
  const current = data.members.filter((m) => m.active);
  const removed = data.members.filter((m) => !m.active && !m.past_only);
  const pastOnly = data.members.filter((m) => m.past_only);
  const update = (payload: Record<string, unknown>) =>
    save.run(async () => {
      await api('member_save', { group_id: data.group.id, ...payload });
      router.refresh();
    }, 'Saved.');
  return (
    <div className="grid-2">
      <section className="stack">
        <h2 className="section-title">
          People <span className="meta">· {current.length}</span>
        </h2>
        <ul className="plain-list">
          {current.map((m) => (
            <li key={m.id}>
              <span>
                <span className="name">{m.display_name}</span>
                {m.role === 'admin' && <span className="pill"> Admin</span>}
              </span>
              <span className="row">
                {owner && (
                  <button
                    className="btn quiet small"
                    disabled={save.busy}
                    onClick={() =>
                      void update({
                        discord_id: m.discord_id,
                        display_name: m.display_name,
                        active: true,
                        role: m.role === 'admin' ? 'member' : 'admin',
                      })
                    }
                  >
                    {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </button>
                )}
                <button
                  className="btn quiet small"
                  disabled={save.busy}
                  onClick={() =>
                    void update({
                      discord_id: m.discord_id,
                      display_name: m.display_name,
                      active: false,
                    })
                  }
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        {removed.length > 0 && (
          <>
            <h3 className="section-title">Removed</h3>
            <ul className="plain-list">
              {removed.map((m) => (
                <li key={m.id}>
                  <span className="muted">{m.display_name}</span>
                  <button
                    className="btn quiet small"
                    disabled={save.busy}
                    onClick={() =>
                      void update({
                        discord_id: m.discord_id,
                        display_name: m.display_name,
                        active: true,
                      })
                    }
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {pastOnly.length > 0 && (
          <>
            <h3 className="section-title">Past only</h3>
            <p className="meta">
              People from past years who aren’t in the server. They’re kept for history only.
            </p>
            <div className="people">
              {pastOnly.map((m) => (
                <span key={m.id}>{m.display_name}</span>
              ))}
            </div>
          </>
        )}
        <p className="meta">Removing someone keeps their past exchanges intact.</p>
        <Feedback {...save} />
      </section>
      <DiscordMemberPicker groupId={data.group.id} members={data.members} />
    </div>
  );
}
function History({ data }: { data: GroupDetail }) {
  const [adding, setAdding] = useState(false);
  const past = data.exchanges.filter((e) => e.historical);
  if (adding)
    return (
      <>
        <h2 className="section-title">Add a past year</h2>
        <PastYearEditor
          groupId={data.group.id}
          members={data.members}
          exchanges={data.exchanges}
          onDone={() => setAdding(false)}
        />
      </>
    );
  return (
    <>
      <div className="row between">
        <h2 className="section-title">Past years</h2>
        <button className="btn primary" onClick={() => setAdding(true)}>
          Add a past year
        </button>
      </div>
      <p className="muted">
        Past years help the draw avoid repeating matches. Partial years still count.
      </p>
      {past.length ? (
        <ExchangeList exchanges={[...past].sort((a, b) => b.sequence - a.sequence)} />
      ) : (
        <Empty title="No past years yet">
          Add the years your group did before using this site.
        </Empty>
      )}
    </>
  );
}
