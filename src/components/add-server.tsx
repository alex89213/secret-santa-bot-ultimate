/**
 * Description:  Form the owner uses to add a Discord server by its ID.
 * Author:       Alex Wu
 * Dependencies: next, components/api.ts, components/feedback.tsx
 * Usage:
 */
'use client';
import { useRouter } from 'next/navigation';
import { api, useAction, formValues } from './api';
import { Feedback } from './feedback';
export function AddServer() {
  const router = useRouter(),
    action = useAction();
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        const data = await action.run(
          () => api<{ id: string }>('activate_group', { guild_id: v.guild_id, name: v.name }),
          'Server added.',
        );
        if (data) {
          router.push(`/groups/${data.id}`);
          router.refresh();
        }
      }}
    >
      <label className="field">
        <span>Name</span>
        <input id="server-name" name="name" required maxLength={80} />
      </label>
      <label className="field">
        <span>Discord server ID</span>
        <input
          id="server-id"
          name="guild_id"
          required
          pattern="[1-9][0-9]{16,19}"
          inputMode="numeric"
        />
        <span className="hint">
          In Discord, turn on Developer Mode, then right-click the server and choose Copy Server ID.
        </span>
      </label>
      <button disabled={action.busy} className="btn primary">
        {action.busy ? 'Checking with Discord…' : 'Add server'}
      </button>
      <Feedback {...action} />
    </form>
  );
}
