/**
 * Description:  Servers page listing the person's servers, with a form for the owner to add one.
 * Author:       Alex Wu
 * Dependencies: next, server/pages.ts, components/ui.tsx, components/add-server.tsx
 * Usage:
 */
import Link from 'next/link';
import { botInviteUrl, pageContext } from '@/server/pages';
import { PageHeading, Empty } from '@/components/ui';
import { AddServer } from '@/components/add-server';
export default async function Servers() {
  const ctx = await pageContext();
  // only the owner and admins see the invite link, since only they set up servers
  const manager = ctx.owner || ctx.groups.some((g) => g.admin);
  const invite = manager ? await botInviteUrl() : null;
  return (
    <>
      <PageHeading title="Servers" />
      <div className="grid-lead">
        <section className="stack">
          {ctx.groups.length ? (
            <ul className="plain-list">
              {ctx.groups.map((g) => (
                <li key={g.id}>
                  <Link className="row-link" href={`/groups/${g.id}`}>
                    <span>
                      <span className="name">{g.name}</span>
                      <span className="meta">
                        {' '}
                        · {g.member_count} members ·{' '}
                        {g.exchanges.filter((e) => !e.historical).length} exchanges
                      </span>
                    </span>
                    {g.admin && <span className="pill">Admin</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No servers yet">
              {ctx.owner
                ? 'Add your Discord server to start your first exchange.'
                : 'Ask your server’s admin to add your Discord account.'}
            </Empty>
          )}
        </section>
        {(ctx.owner || invite) && (
          <section className="card">
            <h2 className="section-title">
              {ctx.owner ? 'Add a Discord server' : 'Invite the bot'}
            </h2>
            {invite ? (
              <p className="muted">
                First,{' '}
                <a className="btn link" href={invite} target="_blank" rel="noopener noreferrer">
                  invite the bot to the server
                </a>
                . It needs no permissions. It only reads the member list and sends DMs.
              </p>
            ) : (
              <p className="notice">
                Couldn’t reach Discord to get the bot’s invite link. Check DISCORD_BOT_TOKEN.
              </p>
            )}
            {ctx.owner && <AddServer />}
          </section>
        )}
      </div>
    </>
  );
}
