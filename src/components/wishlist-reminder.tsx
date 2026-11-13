/**
 * Description:  "Wishlists" card for admins. Shows who in an exchange hasn't added anything to their
 *               wishlist and sends them a reminder DM, at most once an hour.
 * Author:       Alex Wu
 * Dependencies: react, next, domain/types.ts, components/api.ts, components/feedback.tsx,
 *               components/confirm.tsx
 * Usage:
 */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WishlistStatus } from '@/domain/types';
import { api, useAction } from './api';
import { Feedback } from './feedback';
import { ConfirmButton } from './confirm';

/** Shows the people without wishlist items and a button to remind them on Discord. */
export function WishlistReminder({
  exchangeId,
  status,
}: {
  exchangeId: string;
  status: WishlistStatus;
}) {
  const router = useRouter(),
    action = useAction();
  const [result, setResult] = useState<{ sent: string[]; failed: string[] } | null>(null);
  const empty = status.people.filter((p) => !p.has_wishes);
  const recent = status.reminded_recently;
  return (
    <section className="card" aria-label="Wishlists">
      <h2 className="card-title">Wishlists</h2>
      {empty.length === 0 ? (
        <p className="check-line">
          <i aria-hidden="true">✓</i>
          <span>Everyone has added something to their wishlist.</span>
        </p>
      ) : (
        <>
          <p className="muted">
            {empty.length === status.people.length
              ? `Nobody has added anything yet.`
              : `${empty.length} of ${status.people.length} people haven’t added anything yet.`}
          </p>
          <div className="people">
            {empty.map((p) => (
              <span key={p.id}>{p.display_name}</span>
            ))}
          </div>
          <div className="row">
            <ConfirmButton
              label="Remind them on Discord"
              title="Send wishlist reminders?"
              body={
                <p>
                  {empty.length === 1 ? 'This person gets' : `These ${empty.length} people get`} a
                  Discord DM asking them to add a few ideas, with a link to their wishlist.
                  Reminders can go out once an hour.
                </p>
              }
              confirmLabel="Send reminders"
              disabled={action.busy || recent}
              onConfirm={async () => {
                const sent = await action.run(
                  () =>
                    api<{ sent: string[]; failed: string[] }>('wishlist_remind', {
                      exchange_id: exchangeId,
                    }),
                  '',
                );
                if (sent) {
                  setResult(sent);
                  router.refresh();
                }
              }}
            />
          </div>
          {recent && !result && <p className="meta">A reminder went out less than an hour ago.</p>}
        </>
      )}
      {result && (
        <p className="notice success" role="status">
          {result.sent.length === 1 ? 'Sent 1 reminder.' : `Sent ${result.sent.length} reminders.`}
          {result.failed.length > 0 &&
            ` Couldn’t reach ${result.failed.join(', ')}. Their Discord DMs may be closed.`}
        </p>
      )}
      <Feedback error={action.error} />
    </section>
  );
}
