/**
 * Description:  Editor for a person's own wishlist, a numbered list where the order is the ranking.
 * Author:       Alex Wu
 * Dependencies: react, lucide-react, domain/types.ts, components/api.ts, components/feedback.tsx,
 *               components/confirm.tsx
 * Usage:
 */
'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import type { WishlistItem } from '@/domain/types';
import { formatMoney } from '@/domain/money';
import { api, useAction, formValues } from './api';
import { Feedback } from './feedback';
import { ConfirmButton } from './confirm';
/** Edits the signed-in person's wishlist. The up and down buttons change the order. */
export function WishlistEditor({ initial }: { initial: WishlistItem[] }) {
  const [items, setItems] = useState(initial),
    [editing, setEditing] = useState<WishlistItem | null>(null),
    [open, setOpen] = useState(false);
  const action = useAction();
  const move = (index: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setItems(next);
    void action
      .run(() => api<WishlistItem[]>('wishlist_reorder', { ids: next.map((i) => i.id) }), '')
      .then((saved) => setItems(saved ?? items));
  };
  return (
    <div className="grid-lead">
      <section className="stack">
        {items.length ? (
          <ol className="wish">
            {items.map((item, i) => (
              <li key={item.id}>
                <span className="title">{item.title}</span>
                <span className="tools">
                  <button
                    className="icon-btn"
                    aria-label={`Move ${item.title} up`}
                    disabled={i === 0 || action.busy}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Move ${item.title} down`}
                    disabled={i === items.length - 1 || action.busy}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Edit ${item.title}`}
                    onClick={() => {
                      setEditing(item);
                      setOpen(true);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <ConfirmButton
                    className="icon-btn"
                    label={
                      <>
                        <Trash2 size={15} aria-hidden="true" />
                        <span className="sr-only">Remove {item.title}</span>
                      </>
                    }
                    title={`Remove “${item.title}”?`}
                    body={<p>It disappears from your wishlist right away.</p>}
                    confirmLabel="Remove"
                    confirmClassName="btn danger"
                    disabled={action.busy}
                    onConfirm={async () => {
                      const data = await action.run(
                        () => api<WishlistItem[]>('wishlist_delete', { id: item.id }),
                        'Removed.',
                      );
                      if (data) setItems(data);
                    }}
                  />
                </span>
                {(item.description || item.url || item.price !== null) && (
                  <div className="details">
                    {item.description && <p className="preserve">{item.description}</p>}
                    {item.price !== null && <span>About {formatMoney(item.price)}</span>}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        View item
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Nothing here yet. Add the thing you want most first.</p>
        )}
        {!open && (
          <button
            className="btn primary"
            style={{ justifySelf: 'start' }}
            disabled={items.length >= 100}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add a wish
          </button>
        )}
        <Feedback {...action} />
      </section>
      {open && (
        <section className="card" key={editing?.id ?? 'new'}>
          <h2 className="section-title">{editing ? 'Edit wish' : 'Add a wish'}</h2>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = formValues(e.currentTarget);
              const data = await action.run(
                () =>
                  api<WishlistItem[]>('wishlist_save', {
                    ...(editing ? { id: editing.id } : {}),
                    title: v.title,
                    description: v.description,
                    url: v.url,
                    price: v.price === '' ? null : Number(v.price),
                  }),
                'Saved.',
              );
              if (data) {
                setItems(data);
                setOpen(false);
                setEditing(null);
              }
            }}
          >
            <label className="field">
              <span>What is it?</span>
              <input
                id="wish-title"
                name="title"
                required
                maxLength={120}
                defaultValue={editing?.title}
              />
            </label>
            <label className="field">
              <span>
                Details <span className="hint">· optional</span>
              </span>
              <textarea
                id="wish-description"
                name="description"
                maxLength={2000}
                rows={3}
                defaultValue={editing?.description}
              />
            </label>
            <label className="field">
              <span>
                Link <span className="hint">· optional</span>
              </span>
              <input
                id="wish-url"
                name="url"
                type="url"
                maxLength={2048}
                defaultValue={editing?.url ?? ''}
              />
            </label>
            <label className="field">
              <span>
                Rough price <span className="hint">· optional</span>
              </span>
              <input
                id="wish-price"
                name="price"
                type="number"
                min="0"
                max="99999999"
                step="0.01"
                defaultValue={editing?.price ?? ''}
                style={{ width: 160 }}
              />
            </label>
            <div className="row">
              <button className="btn primary" disabled={action.busy}>
                {action.busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
