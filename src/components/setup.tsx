/**
 * Description:  Form for entering the setup secret to become the site owner.
 * Author:       Alex Wu
 * Dependencies: next, components/api.ts, components/feedback.tsx
 * Usage:
 */
'use client';
import { useRouter } from 'next/navigation';
import { api, useAction, formValues } from './api';
import { Feedback } from './feedback';
export function SetupForm() {
  const action = useAction(),
    router = useRouter();
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const result = await action.run(
          () => api('claim_owner', { secret: formValues(form).secret }),
          'You’re the owner now.',
        );
        if (result) {
          form.reset();
          router.push('/servers');
          router.refresh();
        }
      }}
    >
      <label className="field">
        <span>Setup secret</span>
        <input
          id="setup-secret"
          name="secret"
          type="password"
          autoComplete="off"
          required
          maxLength={512}
        />
      </label>
      <button disabled={action.busy} className="btn primary">
        {action.busy ? 'Checking…' : 'Become the owner'}
      </button>
      <Feedback {...action} />
    </form>
  );
}
