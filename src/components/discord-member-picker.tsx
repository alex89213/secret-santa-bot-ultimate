/**
 * Description:  Card for adding people from the Discord server, with search, paging and add by user
 *               ID.
 * Author:       Alex Wu
 * Dependencies: react, next, domain/types.ts, components/api.ts, components/feedback.tsx,
 *               components/use-discord-members.ts
 * Usage:
 */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Member } from '@/domain/types';
import { api, formValues, useAction } from './api';
import { Feedback } from './feedback';
import { useDiscordMembers, type DiscordPick } from './use-discord-members';
/** Adds people from the Discord server. Refreshes every 30 seconds while visible. */
export function DiscordMemberPicker({ groupId, members }: { groupId: string; members: Member[] }) {
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState(new Map<string, DiscordPick>());
  const picker = useDiscordMembers(groupId, query),
    save = useAction(),
    router = useRouter();
  const active = new Set(members.filter((m) => m.active).map((m) => m.discord_id));
  return (
    <section className="card" aria-label="Add people from Discord">
      <div className="row between">
        <h2 className="card-title">Add people from Discord</h2>
        <button
          className="btn quiet small"
          disabled={picker.busy}
          onClick={() => void picker.refresh()}
        >
          Refresh
        </button>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void picker.refresh();
        }}
      >
        <label className="field" style={{ flex: 1 }}>
          <span className="sr-only">Search Discord members</span>
          <input
            id="discord-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            aria-label="Search Discord members"
          />
        </label>
        <button className="btn secondary" disabled={picker.busy}>
          Search
        </button>
      </form>
      <p role="status" className="meta">
        {picker.busy
          ? 'Loading people from Discord…'
          : picker.updated
            ? `${picker.members.length} people in the server`
            : 'Loading people from Discord…'}
      </p>
      {picker.members.length > 0 ? (
        <div className="checklist">
          {picker.members.map((m) => (
            <label className="choice" key={m.discord_id}>
              <input
                type="checkbox"
                disabled={active.has(m.discord_id) || save.busy}
                checked={active.has(m.discord_id) || selected.has(m.discord_id)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelected((previous) => {
                    const next = new Map(previous);
                    if (checked) next.set(m.discord_id, m);
                    else next.delete(m.discord_id);
                    return next;
                  });
                }}
              />
              <span>
                {m.display_name}
                {active.has(m.discord_id) && <span className="meta"> · added</span>}
              </span>
            </label>
          ))}
        </div>
      ) : (
        !picker.busy &&
        picker.updated && (
          <p className="muted">
            Nobody matches. Try another name, or add someone by user ID below.
          </p>
        )
      )}
      <div className="row">
        <button
          className="btn primary"
          disabled={save.busy || !selected.size}
          onClick={async () => {
            await save.run(async () => {
              try {
                for (const m of selected.values()) {
                  await api('member_save', { group_id: groupId, ...m });
                  setSelected((previous) => {
                    const next = new Map(previous);
                    next.delete(m.discord_id);
                    return next;
                  });
                }
              } finally {
                router.refresh();
              }
            }, 'Added.');
          }}
        >
          Add {selected.size || ''} {selected.size === 1 ? 'person' : 'people'}
        </button>
        {picker.next && (
          <button
            className="btn quiet"
            disabled={picker.busy}
            onClick={() => void picker.loadMore()}
          >
            Load more
          </button>
        )}
        {selected.size > 0 && (
          <button className="btn quiet" disabled={save.busy} onClick={() => setSelected(new Map())}>
            Clear
          </button>
        )}
      </div>
      <Feedback error={picker.error} />
      <Feedback {...save} />
      <p className="meta">Adding people here doesn’t change exchanges that already exist.</p>
      <details>
        <summary className="btn link">Add by Discord user ID</summary>
        <form
          className="form"
          style={{ marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const result = await save.run(
              () =>
                api('member_save', {
                  group_id: groupId,
                  discord_id: formValues(form).discord_id,
                  display_name: 'Discord member',
                }),
              'Added.',
            );
            if (result) {
              form.reset();
              router.refresh();
            }
          }}
        >
          <label className="field">
            <span>Discord user ID</span>
            <input
              id="manual-discord-id"
              name="discord_id"
              required
              pattern="[1-9][0-9]{16,19}"
              inputMode="numeric"
            />
            <span className="hint">We check with Discord that they’re in the server.</span>
          </label>
          <button className="btn secondary" disabled={save.busy}>
            Add
          </button>
        </form>
      </details>
    </section>
  );
}
