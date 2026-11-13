/**
 * Description:  Form for recording a past year: who took part (including people no longer in the
 *               server), where the year goes in the order, and any known matches. Used only inside
 *               client components.
 * Author:       Alex Wu
 * Dependencies: react, next, domain/types.ts, domain/history.ts, components/api.ts,
 *               components/feedback.tsx
 * Usage:
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Exchange, Member } from '@/domain/types';
import { checkPastYear } from '@/domain/history';
import { api, useAction } from './api';
import { Feedback } from './feedback';
type Person = Pick<Member, 'id' | 'display_name' | 'past_only'>;
/** Records a new past year, or replaces one when `existing` is given. */
export function PastYearEditor({
  groupId,
  members,
  exchanges,
  existing,
  onDone,
}: {
  groupId: string;
  members: Member[];
  exchanges: Exchange[];
  /** The past year being corrected, with its id, name and people. */
  existing?: { id: string; name: string; participantIds: string[] };
  onDone?: () => void;
}) {
  const router = useRouter(),
    save = useAction(),
    addPerson = useAction();
  const ordered = useMemo(
    () =>
      [...exchanges].filter((e) => e.id !== existing?.id).sort((a, b) => a.sequence - b.sequence),
    [exchanges, existing?.id],
  );
  const lastPast = [...ordered].reverse().find((e) => e.historical);
  const [name, setName] = useState(existing?.name ?? ''),
    [after, setAfter] = useState<string>(lastPast?.id ?? ''),
    [people, setPeople] = useState<Person[]>(
      members.filter((m) => m.active || m.past_only || existing?.participantIds.includes(m.id)),
    ),
    [selected, setSelected] = useState<Set<string>>(new Set(existing?.participantIds ?? [])),
    [gives, setGives] = useState<Record<string, string | undefined>>({}),
    [adding, setAdding] = useState(false),
    [newName, setNewName] = useState(''),
    [newDiscord, setNewDiscord] = useState(''),
    [acknowledged, setAcknowledged] = useState(false);
  const chosen = people.filter((p) => selected.has(p.id));
  const check = checkPastYear(
    chosen.map((p) => ({ id: p.id, name: p.display_name })),
    gives,
  );
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      setGives(Object.fromEntries(Object.entries(gives).filter(([g, r]) => g !== id && r !== id)));
    } else next.add(id);
    setSelected(next);
  };
  async function addPastPerson() {
    const result = await addPerson.run(
      () =>
        api<{ id: string; existing: boolean }>('past_member_add', {
          group_id: groupId,
          display_name: newName,
          discord_id: newDiscord.trim(),
        }),
      '',
    );
    if (!result) return;
    if (!people.some((p) => p.id === result.id))
      setPeople([...people, { id: result.id, display_name: newName.trim(), past_only: true }]);
    setSelected(new Set([...selected, result.id]));
    setNewName('');
    setNewDiscord('');
    setAdding(false);
  }
  async function submit() {
    const pairs = chosen
      .filter((p) => gives[p.id])
      .map((p) => ({ giver: p.id, recipient: gives[p.id]! }));
    const payload = { name, members: chosen.map((p) => p.id), pairs };
    const result = await save.run(
      () =>
        existing
          ? api('history_correct', { ...payload, exchange_id: existing.id, acknowledge: true })
          : api('history_import', { ...payload, group_id: groupId, after: after || null }),
      existing ? 'Past year updated.' : 'Past year saved.',
    );
    if (result) {
      router.refresh();
      onDone?.();
    }
  }
  const timeline = (() => {
    const list: { id: string; name: string; isNew?: boolean }[] = ordered.map((e) => ({
      id: e.id,
      name: e.name,
    }));
    const at = after ? list.findIndex((e) => e.id === after) + 1 : 0;
    if (!existing)
      list.splice(at, 0, { id: 'new', name: name.trim() || 'New past year', isNew: true });
    return list;
  })();
  const canSave =
    name.trim() &&
    check.state !== 'error' &&
    !(check.state === 'partial' && check.known === 0) &&
    (!existing || acknowledged);
  return (
    <div className="grid-lead">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void submit();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input
            id="past-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </label>
        {!existing && (
          <label className="field">
            <span>Comes after</span>
            <select id="past-after" value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="">Nothing (it’s the oldest)</option>
              {ordered.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="hint">Order decides which matches count as recent.</span>
          </label>
        )}
        <div className="field">
          <span>Who took part</span>
          <div className="chips">
            {people.map((p) => (
              <button
                type="button"
                key={p.id}
                className="chip"
                aria-pressed={selected.has(p.id)}
                onClick={() => toggle(p.id)}
              >
                {p.display_name}
                {p.past_only && <span className="tag">Past only</span>}
              </button>
            ))}
            {!adding && (
              <button type="button" className="chip add" onClick={() => setAdding(true)}>
                + Add someone who’s not in the server
              </button>
            )}
          </div>
          {adding && (
            <div className="inline-panel">
              <label className="field">
                <span>Name</span>
                <input
                  id="past-person-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </label>
              <label className="field">
                <span>
                  Discord user ID <span className="hint">· optional</span>
                </span>
                <input
                  id="past-person-discord"
                  value={newDiscord}
                  onChange={(e) => setNewDiscord(e.target.value)}
                  inputMode="numeric"
                  pattern="[1-9][0-9]{16,19}"
                />
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={!newName.trim() || addPerson.busy}
                onClick={() => void addPastPerson()}
              >
                Add
              </button>
              <button type="button" className="btn secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          )}
          <Feedback error={addPerson.error} />
        </div>
        {chosen.length > 0 && (
          <div className="field">
            <span>Who gave to whom</span>
            {existing && (
              <span className="hint">
                Enter every known match again. The previous version is kept privately.
              </span>
            )}
            <div className="pairs">
              {chosen.map((p) => {
                const value = gives[p.id] ?? '';
                const repeated =
                  check.state === 'error' && check.repeatedRecipients.includes(value);
                return (
                  <PairRow
                    key={p.id}
                    person={p}
                    options={chosen.filter((o) => o.id !== p.id)}
                    value={value}
                    invalid={repeated}
                    onChange={(recipient) => setGives({ ...gives, [p.id]: recipient || undefined })}
                  />
                );
              })}
            </div>
          </div>
        )}
        <p className={`status-line ${check.state}`} role="status">
          {check.message}
        </p>
        {existing && (
          <label className="choice">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            Replace this year’s people and matches. Any draw that hasn’t been locked in will need
            redrawing.
          </label>
        )}
        <div className="row">
          <button className="btn primary" disabled={!canSave || save.busy}>
            {save.busy ? 'Saving…' : existing ? 'Save changes' : 'Save past year'}
          </button>
          {onDone && (
            <button type="button" className="btn secondary" onClick={onDone}>
              Cancel
            </button>
          )}
        </div>
        <Feedback {...save} />
      </form>
      <section className="stack">
        {!existing && (
          <>
            <h3 className="section-title">History order</h3>
            <ol className="timeline">
              {timeline.map((t) => (
                <li key={t.id} className={t.isNew ? 'new' : undefined}>
                  <span>{t.name}</span>
                  {t.isNew && <span className="tag">Adding</span>}
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="meta">
          People marked <span className="tag">Past only</span> stay in history so records and repeat
          checks are correct. They can’t sign in, get no DMs, and never show up when you pick people
          for a new exchange.
        </p>
      </section>
    </div>
  );
}
function PairRow({
  person,
  options,
  value,
  invalid,
  onChange,
}: {
  person: Person;
  options: Person[];
  value: string;
  invalid: boolean;
  onChange: (recipient: string) => void;
}) {
  const id = `gives-${person.id}`;
  return (
    <>
      <label className="giver" htmlFor={id}>
        {person.display_name}
        {person.past_only && <span className="tag">Past only</span>}
      </label>
      <span className="arrow" aria-hidden="true">
        gave to
      </span>
      <select
        id={id}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Don’t know</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.display_name}
          </option>
        ))}
      </select>
    </>
  );
}
