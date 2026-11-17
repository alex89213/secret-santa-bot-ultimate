/**
 * Description:  One-click setup for servers the bot is already in, and a fallback form for adding a
 *               server by its ID.
 * Author:       Alex Wu
 * Dependencies: next, components/api.ts, components/feedback.tsx
 * Usage:
 */
'use client';
import { useRouter } from 'next/navigation';
import { api, useAction, formValues } from './api';
import { Feedback } from './feedback';
/** Sets up a server the bot is already in, using the name it has in Discord. */
export function SetUpServer({ guildId }: { guildId: string }) {
  const router = useRouter(),
    action = useAction();
  // the message sits under the button, and only an error shows since success opens the server
  return (
    <div className="set-up">
      <button
        className="btn primary small"
        disabled={action.busy}
        onClick={async () => {
          const data = await action.run(
            () => api<{ id: string }>('activate_group', { guild_id: guildId }),
            'Server added.',
          );
          if (data) {
            router.push(`/groups/${data.id}`);
            router.refresh();
          }
        }}
      >
        {action.busy ? 'Setting up…' : 'Set up'}
      </button>
      {action.error && <Feedback error={action.error} />}
    </div>
  );
}
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
          () =>
            api<{ id: string }>('activate_group', {
              guild_id: v.guild_id,
              ...(String(v.name ?? '').trim() ? { name: v.name } : {}),
            }),
          'Server added.',
        );
        if (data) {
          router.push(`/groups/${data.id}`);
          router.refresh();
        }
      }}
    >
      <label className="field">
        <span>Name (optional)</span>
        <input id="server-name" name="name" maxLength={80} placeholder="Uses the Discord name" />
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
