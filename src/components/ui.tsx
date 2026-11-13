/**
 * Description:  Shared page pieces: headings, status pills, exchange lists, wishlists and text
 *               helpers.
 * Author:       Alex Wu
 * Dependencies: next, domain/types.ts
 * Usage:
 */
import Link from 'next/link';
import type { Exchange, WishlistItem } from '@/domain/types';
import { formatMoney } from '@/domain/money';
export function PageHeading({
  title,
  eyebrow,
  meta,
  children,
}: {
  title: string;
  eyebrow?: { href?: string; label: string };
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      {eyebrow && (
        <span className="eyebrow">
          {eyebrow.href ? <Link href={eyebrow.href}>{eyebrow.label}</Link> : eyebrow.label}
        </span>
      )}
      <div className="row">
        <h1>{title}</h1>
        {children}
      </div>
      {meta && <p className="meta">{meta}</p>}
    </header>
  );
}
/** Gets the status label and color for an exchange or past year. */
function statusLabel(e: Exchange): { label: string; tone: string } {
  if (e.historical)
    return e.history_complete
      ? { label: 'Complete', tone: 'complete' }
      : { label: 'Partial', tone: 'partial' };
  if (e.status === 'draft') return { label: 'Drawing names', tone: 'drawing' };
  if (e.status === 'finalized') return { label: 'Matched', tone: 'matched' };
  return { label: 'Done', tone: 'done' };
}
export function Status({ exchange }: { exchange: Exchange }) {
  const { label, tone } = statusLabel(exchange);
  return <span className={`pill ${tone}`}>{label}</span>;
}
export function budgetText(e: Pick<Exchange, 'budget' | 'currency'>) {
  return e.budget !== null ? `${formatMoney(e.budget, e.currency)} budget` : null;
}
export const repeatRule = (e: Exchange) =>
  e.mode === 'strict'
    ? 'Never repeat past matches'
    : e.mode === 'recent'
      ? `Avoid matches from the last ${e.recent_count === 1 ? 'exchange' : `${e.recent_count} exchanges`}`
      : 'Allow repeats if needed';
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function ExchangeList({ exchanges }: { exchanges: Exchange[] }) {
  return (
    <ul className="plain-list">
      {exchanges.map((e) => (
        <li key={e.id}>
          <Link className="row-link" href={`/exchanges/${e.id}`}>
            <span>
              <span className="name">{e.name}</span>
              {budgetText(e) && <span className="meta"> · {budgetText(e)}</span>}
            </span>
            <Status exchange={e} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
/** Shows a wishlist as a numbered list, most wanted first. */
export function WishlistList({
  items,
  compact = false,
  currency,
}: {
  items: WishlistItem[];
  compact?: boolean;
  /** Shows prices in this currency, such as the exchange's currency when a giver views them. */
  currency?: string;
}) {
  if (!items.length) return <p className="muted">No wishes yet.</p>;
  return (
    <ol className="wish">
      {items.map((item) => (
        <li key={item.id}>
          <span className="title">{item.title}</span>
          <span />
          {!compact && (item.description || item.url || item.price !== null) && (
            <div className="details">
              {item.description && <p className="preserve">{item.description}</p>}
              {item.price !== null && <span>About {formatMoney(item.price, currency)}</span>}
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
  );
}
