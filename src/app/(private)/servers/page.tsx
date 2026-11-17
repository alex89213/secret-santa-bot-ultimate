/**
 * Description:  Servers page listing the person's servers. The owner can set up any server the bot
 *               is in with one click, invite the bot to a new one, or add a server by its ID.
 * Author:       Alex Wu
 * Dependencies: next, server/pages.ts, components/ui.tsx, components/add-server.tsx
 * Usage:
 */
import Link from 'next/link';
import { botServers, pageContext } from '@/server/pages';
import { PageHeading, Empty } from '@/components/ui';
import { AddServer, SetUpServer } from '@/components/add-server';
/** Messages for the `invite` value the bot invite routes send back to this page. */
const NOTICES = new Map<string, { text: string; error?: boolean }>([
  [
    'owner',
    { text: 'The bot is in the server. The site’s owner can now set it up from this page.' },
  ],
  ['expired', { text: 'That invite timed out. Invite the bot again.', error: true }],
  [
    'failed',
    {
      text: 'The bot was invited, but the server couldn’t be set up. Try Set up below.',
      error: true,
    },
  ],
  [
    'unreachable',
    { text: 'Couldn’t reach Discord to start the invite. Check DISCORD_BOT_TOKEN.', error: true },
  ],
]);
export default async function Servers({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const ctx = await pageContext();
  const { invite } = await searchParams;
  const notice = typeof invite === 'string' ? NOTICES.get(invite) : undefined;
  // only the owner and admins see the invite link, since only they set up servers
  const manager = ctx.owner || ctx.groups.some((g) => g.admin);
  // list the servers the bot is in that aren't on the site yet, which only the owner can set up
  const added = new Set(ctx.groups.map((g) => g.guild_id));
  const inDiscord = ctx.owner ? await botServers() : [];
  const ready = inDiscord?.filter((g) => !added.has(g.id)) ?? [];
  return (
    <>
      <PageHeading title="Servers" />
      {notice && <p className={`notice${notice.error ? ' error' : ''}`}>{notice.text}</p>}
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
                ? 'Invite the bot to your Discord server and it’s set up for you.'
                : 'Ask your server’s admin to add your Discord account.'}
            </Empty>
          )}
          {ready.length > 0 && (
            <section className="card">
              <h2 className="section-title">Ready to set up</h2>
              <p className="muted">The bot is already in these servers.</p>
              <ul className="plain-list">
                {ready.map((g) => (
                  <li key={g.id}>
                    <span className="name">{g.name}</span>
                    <SetUpServer guildId={g.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
        {manager && (
          <section className="card">
            <h2 className="section-title">Add a Discord server</h2>
            <p>
              <a className="btn primary" href="/bot/invite">
                Invite the bot
              </a>
            </p>
            <p className="muted">
              Pick a server in Discord and you’ll come straight back to it here, ready to go. The
              bot needs no permissions. It only reads the member list and sends DMs.
            </p>
            {inDiscord === null && (
              <p className="notice">
                Couldn’t reach Discord to list the bot’s servers. Check DISCORD_BOT_TOKEN.
              </p>
            )}
            {ctx.owner && (
              <details>
                <summary className="muted">Add by server ID instead</summary>
                <AddServer />
              </details>
            )}
          </section>
        )}
      </div>
    </>
  );
}
