/**
 * Description:  "Send matches" card. Queues one DM per person and keeps sending batches while the
 *               page is open.
 * Author:       Alex Wu
 * Dependencies: react, domain/types.ts, components/api.ts, components/feedback.tsx,
 *               components/confirm.tsx
 * Usage:
 */
'use client';
import { useEffect, useState } from 'react';
import type { ExchangeDetail, DeliveryProgress, Delivery } from '@/domain/types';
import { api, useAction } from './api';
import { Feedback } from './feedback';
import { ConfirmButton } from './confirm';
function progress(data: ExchangeDetail): DeliveryProgress {
  const count = (s: Delivery['status']) => data.deliveries.filter((d) => d.status === s).length;
  return {
    deliveries: data.deliveries,
    total: data.deliveries.length,
    pending: count('pending'),
    sending: count('sending'),
    sent: count('sent'),
    failed: count('failed'),
    next_attempt_at: null,
  };
}
const STATUS: Record<Delivery['status'], string> = {
  pending: 'Waiting',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Not sent',
};
const REASON: Record<string, string> = {
  uncertain_delivery: 'might have been sent',
  dm_forbidden: 'DMs closed',
  rate_limited: 'Discord asked us to wait',
  discord_unavailable: 'Discord unavailable',
};
/** Shows the "Send matches" card and keeps sending batches while the page is open. */
export function ExchangeNotifications({ data }: { data: ExchangeDetail }) {
  const [status, setStatus] = useState(() => progress(data)),
    [running, setRunning] = useState(false),
    [error, setError] = useState('');
  const action = useAction();
  const eid = data.exchange.id;
  function apply(result: DeliveryProgress) {
    setStatus(result);
    setRunning(result.pending + result.sending > 0);
  }
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const retry = status.next_attempt_at ? Date.parse(status.next_attempt_at) - Date.now() : 0;
    const delay = Math.max(1000, Math.min(60000, retry > 0 ? retry : status.sending ? 3000 : 1000));
    const timer = setTimeout(async () => {
      try {
        const result = await api<DeliveryProgress>(
          'notifications_process',
          { exchange_id: eid },
          controller.signal,
        );
        if (!controller.signal.aborted) apply(result);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Sending paused. Resume to continue.');
          setRunning(false);
        }
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [running, status, eid]);
  useEffect(() => {
    if (running || (!status.pending && !status.sending)) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void api<DeliveryProgress>('notifications_status', { exchange_id: eid }, controller.signal)
        .then(setStatus)
        .catch(() => {});
    }, 5000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [running, status.pending, status.sending, eid]);
  async function send(retry = false) {
    setError('');
    const result = await action.run(async () => {
      if (retry) await api('notifications_retry', { exchange_id: eid, acknowledge: true });
      return api<DeliveryProgress>(retry ? 'notifications_process' : 'notifications_send', {
        exchange_id: eid,
      });
    }, '');
    if (result) apply(result);
  }
  const complete = status.total > 0 && status.sent === status.total;
  const busy = action.busy || running;
  const retryable = status.deliveries.some((d) => d.status === 'failed' && d.attempts < 10);
  const uncertain = status.deliveries.some((d) => d.error_code === 'uncertain_delivery');
  const name = (id: string) =>
    data.participants.find((p) => p.id === id)?.display_name ?? 'Someone';
  return (
    <section className="card" aria-label="Send matches">
      <h2 className="card-title">Send matches</h2>
      <p className="muted">
        Each person gets a Discord DM with their match and a link to the site.
      </p>
      <p role="status" className="meta">
        {complete
          ? `All ${status.total} sent.`
          : busy
            ? `Sending… ${status.sent} of ${status.total || data.participants.length} sent.`
            : status.total
              ? `${status.sent} of ${status.total} sent.`
              : 'Nothing sent yet.'}
      </p>
      {running && status.next_attempt_at && (
        <p className="meta">Discord asked us to wait. Sending continues automatically.</p>
      )}
      <div className="row">
        {!complete && (
          <ConfirmButton
            className="btn primary"
            label={
              busy
                ? 'Sending…'
                : status.pending || status.sending
                  ? 'Resume sending'
                  : 'Send everyone their match'
            }
            title="Send everyone their match?"
            body={
              <p>
                Each person in {data.exchange.name} gets a Discord DM with their match. Anyone
                already sent is skipped.
              </p>
            }
            confirmLabel="Send"
            disabled={busy}
            onConfirm={() => send()}
          />
        )}
        {status.failed > 0 && (
          <ConfirmButton
            label="Try failed ones again"
            title="Try the failed DMs again?"
            body={
              uncertain ? (
                <p>
                  Some of these might have arrived even though Discord didn’t confirm it. Trying
                  again could send those people a second copy.
                </p>
              ) : (
                <p>Only the DMs that didn’t go through are retried.</p>
              )
            }
            confirmLabel="Try again"
            disabled={busy || !retryable}
            onConfirm={() => send(true)}
          />
        )}
      </div>
      {status.failed > 0 && (
        <p className="notice">
          Some DMs didn’t go through. People with DMs closed need to allow messages from server
          members in Discord, then you can try again.
        </p>
      )}
      {status.deliveries.length > 0 && (
        <div className="delivery-list">
          {status.deliveries.map((d) => (
            <div key={d.id}>
              <span>{name(d.giver)}</span>
              <span className="meta">
                {STATUS[d.status]}
                {d.error_code
                  ? ` · ${REASON[d.error_code] ?? d.error_code.replaceAll('_', ' ')}`
                  : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="meta">
        Progress is saved, so you can leave and come back. Sending never changes the matches.
      </p>
      <Feedback error={error || action.error} />
    </section>
  );
}
