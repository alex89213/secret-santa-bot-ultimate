/**
 * Description:  Server page listing its exchanges, with the Exchanges, People and History tabs for
 *               admins.
 * Author:       Alex Wu
 * Dependencies: next, zod, server/pages.ts, domain/types.ts, components/ui.tsx,
 *               components/group-admin.tsx
 * Usage:
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { pageContext, resource } from '@/server/pages';
import type { GroupDetail } from '@/domain/types';
import { PageHeading, ExchangeList, Empty } from '@/components/ui';
import { GroupAdmin } from '@/components/group-admin';
export default async function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [data, ctx] = await Promise.all([
    resource<GroupDetail>('group', { group_id: id }),
    pageContext(),
  ]);
  const live = data.exchanges.filter((e) => !e.historical);
  return (
    <>
      <PageHeading
        title={data.group.name}
        eyebrow={{ href: '/servers', label: 'Servers' }}
        meta={`${data.members.filter((m) => m.active).length} members`}
      />
      {data.admin ? (
        <GroupAdmin data={data} owner={ctx.owner} />
      ) : live.length ? (
        <ExchangeList exchanges={live} />
      ) : (
        <Empty title="No exchanges yet">Your server’s admin hasn’t started one.</Empty>
      )}
    </>
  );
}
