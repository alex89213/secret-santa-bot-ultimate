/**
 * Description:  Exchange page with the person's own match and that person's wishlist, plus the
 *               admin tools for admins.
 * Author:       Alex Wu
 * Dependencies: next, zod, server/pages.ts, domain/types.ts, components/ui.tsx,
 *               components/exchange-admin.tsx
 * Usage:
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { resource } from '@/server/pages';
import type { ExchangeDetail, GroupDetail, WishlistStatus } from '@/domain/types';
import { PageHeading, Status, WishlistList, budgetText, repeatRule } from '@/components/ui';
import { ExchangeAdmin } from '@/components/exchange-admin';
export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await resource<ExchangeDetail>('exchange', { exchange_id: id });
  const { exchange: e } = data;
  const group = data.admin ? await resource<GroupDetail>('group', { group_id: e.group_id }) : null;
  // admins of a running exchange see who still has an empty wishlist
  const wishlists =
    data.admin && !e.historical && e.status !== 'completed'
      ? await resource<WishlistStatus>('wishlist_status', { exchange_id: e.id })
      : null;
  const meta = e.historical
    ? `Past year · ${data.participants.length} people`
    : [budgetText(e), repeatRule(e), `${data.participants.length} people`]
        .filter(Boolean)
        .join(' · ');
  return (
    <>
      <PageHeading
        title={e.name}
        eyebrow={{ href: `/groups/${e.group_id}`, label: data.group_name }}
        meta={meta}
      >
        <Status exchange={e} />
      </PageHeading>
      {data.recipient ? (
        <div className="grid-lead">
          <section className="card">
            <div className="match" style={{ borderTop: 0, paddingTop: 0 }}>
              <div>
                <small>You’re giving to</small>
                <b>{data.recipient.display_name}</b>
              </div>
            </div>
            <p className="meta">Keep it secret. Only you can see this.</p>
          </section>
          <section className="stack">
            <h2 className="section-title">Their wishlist</h2>
            <WishlistList items={data.recipient.wishlist} currency={e.currency} />
          </section>
        </div>
      ) : (
        !data.admin && (
          <p className="muted">
            {e.historical
              ? e.history_complete
                ? 'A complete record of this past year.'
                : 'A partial record of this past year.'
              : e.status === 'draft'
                ? 'Names haven’t been drawn yet. Your match shows up here once they are.'
                : data.own_member_id
                  ? 'This exchange is finished.'
                  : 'You’re not taking part in this exchange.'}
          </p>
        )
      )}
      {data.admin && group && (
        <ExchangeAdmin
          data={data}
          members={group.members}
          exchanges={group.exchanges}
          wishlists={wishlists}
        />
      )}
    </>
  );
}
