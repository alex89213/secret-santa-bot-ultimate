/**
 * Description:  Home page with the signed-in person's current exchanges and matches, their servers
 *               and their wishlist.
 * Author:       Alex Wu
 * Dependencies: next, server/pages.ts, domain/types.ts, components/ui.tsx
 * Usage:
 */
import Link from 'next/link';
import { pageContext, resource } from '@/server/pages';
import type { Exchange, ExchangeDetail, WishlistItem } from '@/domain/types';
import { PageHeading, Empty, Status, WishlistList, budgetText } from '@/components/ui';
export default async function Home() {
  const ctx = await pageContext();
  const eligible = ctx.owner || ctx.groups.length > 0;
  const current = ctx.groups.flatMap((g) =>
    g.exchanges
      .filter((e) => !e.historical && ['draft', 'finalized'].includes(e.status))
      .map((e) => ({ exchange: e, group: g.name })),
  );
  // load each current exchange to get the person's match, there are only ever a few
  const [details, wishes] = await Promise.all([
    Promise.all(
      current.map((c) => resource<ExchangeDetail>('exchange', { exchange_id: c.exchange.id })),
    ),
    eligible ? resource<WishlistItem[]>('wishlist') : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeading title="Your exchanges" />
      {ctx.setup_available && (
        <p className="notice">
          This site has no owner yet.{' '}
          <Link className="btn link" href="/setup">
            Claim ownership
          </Link>
        </p>
      )}
      {current.length ? (
        <div className="cards">
          {current.map(({ exchange, group }, i) => (
            <ExchangeCard key={exchange.id} exchange={exchange} group={group} detail={details[i]} />
          ))}
        </div>
      ) : (
        <Empty title="No exchanges right now">
          {ctx.groups.length
            ? 'When an admin starts an exchange that includes you, it shows up here.'
            : 'Ask your server’s admin to add your Discord account.'}
        </Empty>
      )}
      <div className="grid-2">
        <section className="stack">
          <div className="row between">
            <h2 className="section-title">Servers</h2>
            {ctx.owner && (
              <Link className="btn link" href="/servers">
                Add a server
              </Link>
            )}
          </div>
          {ctx.groups.length ? (
            <ul className="plain-list">
              {ctx.groups.map((g) => (
                <li key={g.id}>
                  <Link className="row-link" href={`/groups/${g.id}`}>
                    <span>
                      <span className="name">{g.name}</span>
                      <span className="meta"> · {g.member_count} members</span>
                    </span>
                    {g.admin && <span className="pill">Admin</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">You’re not in any servers yet.</p>
          )}
        </section>
        {eligible && (
          <section className="stack">
            <div className="row between">
              <h2 className="section-title">My wishlist</h2>
              <Link className="btn link" href="/wishlist">
                {wishes.length ? 'Edit' : 'Add wishes'}
              </Link>
            </div>
            <WishlistList items={wishes.slice(0, 5)} compact />
          </section>
        )}
      </div>
    </>
  );
}
function ExchangeCard({
  exchange,
  group,
  detail,
}: {
  exchange: Exchange;
  group: string;
  detail: ExchangeDetail;
}) {
  const meta = [group, budgetText(exchange)].filter(Boolean).join(' · ');
  return (
    <article className="card">
      <div className="row between">
        <Link className="card-title" href={`/exchanges/${exchange.id}`}>
          {exchange.name}
        </Link>
        <Status exchange={exchange} />
      </div>
      <span className="meta">{meta}</span>
      <div className="match">
        {detail.recipient ? (
          <>
            <div>
              <small>You’re giving to</small>
              <b>{detail.recipient.display_name}</b>
            </div>
            <Link className="btn link" href={`/exchanges/${exchange.id}`}>
              See wishlist ({detail.recipient.wishlist.length})
            </Link>
          </>
        ) : (
          <div>
            <small>Your match</small>
            <span className="meta">
              {exchange.status === 'draft'
                ? 'Names haven’t been drawn yet.'
                : detail.own_member_id
                  ? 'Not available.'
                  : 'You’re not taking part in this one.'}
            </span>
          </div>
        )}
        {detail.admin && (
          <Link className="btn link" href={`/exchanges/${exchange.id}`}>
            Manage
          </Link>
        )}
      </div>
    </article>
  );
}
