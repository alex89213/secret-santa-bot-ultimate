/**
 * Description:  Delete control for an exchange or past year that asks for its exact name first.
 * Author:       Alex Wu
 * Dependencies: react, next, domain/types.ts, components/api.ts, components/feedback.tsx
 * Usage:
 */
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Exchange } from '@/domain/types';
import { api, useAction } from './api';
import { Feedback } from './feedback';
export function DeleteExchange({ exchange }: { exchange: Exchange }) {
  const dialog = useRef<HTMLDialogElement>(null),
    [confirmation, setConfirmation] = useState('');
  const action = useAction(),
    router = useRouter();
  const what = exchange.historical ? 'past year' : 'exchange';
  return (
    <div className="danger-zone">
      <div>
        <h2 className="section-title">Delete this {what}</h2>
        <p className="meta">Removes it and its matches for good.</p>
      </div>
      <button
        className="btn danger"
        onClick={() => {
          setConfirmation('');
          dialog.current?.showModal();
        }}
      >
        Delete {what}
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="delete-exchange-title"
        onCancel={(e) => {
          if (action.busy) e.preventDefault();
        }}
      >
        <h2 id="delete-exchange-title">Delete {exchange.name}?</h2>
        <p className="muted">
          This deletes the {what}, its people list, its matches and its DM records. Its matches will
          no longer count when avoiding repeats. DMs already sent stay in Discord.
        </p>
        <form
          className="form"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await action.run(
              () =>
                api('exchange_delete', { exchange_id: exchange.id, confirm_name: confirmation }),
              'Deleted.',
            );
            if (result) {
              dialog.current?.close();
              router.replace(`/groups/${exchange.group_id}`);
              router.refresh();
            }
          }}
        >
          <label className="field">
            <span>Type “{exchange.name}” to confirm</span>
            <input
              id="delete-confirm-name"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn secondary"
              disabled={action.busy}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button className="btn danger" disabled={action.busy || confirmation !== exchange.name}>
              {action.busy ? 'Deleting…' : `Delete ${what}`}
            </button>
          </div>
          <Feedback {...action} />
        </form>
      </dialog>
    </div>
  );
}
