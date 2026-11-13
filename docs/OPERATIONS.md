# Operations

Backups, upgrades, rollback and troubleshooting for a running installation.

## Backups

1. Pause sending and admin work during the backup window.
2. Back up with Supabase backups or point-in-time recovery, or `pg_dump` over a protected connection. Include the `public` application tables, the `ssbu_private` schema (draw candidates, history audit, rate limits) and the Auth schema where your method supports it.
3. Record the deployed commit, applied migration versions, environment variable names and OAuth callback settings. Keep secret values in a password manager, not with the backup.
4. Test the backup by restoring it into a separate project and checking a few groups, matches and wishlists.

Backups contain everyone's matches and personal data. Encrypt them and restrict access. Never paste connection strings, keys, tokens, dumps or match lists into issues or logs.

## Upgrading

1. Read the release notes and every new migration. Released migrations are never edited; changes always arrive as new files.
2. Install pinned dependencies with `npm ci`, then run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e` and `npm run build`. The database and browser tests run against a local Supabase stack.
3. Try the upgrade on a restored copy of your database, with Discord mocked or a separate test bot, and scheduled sending turned off.
4. Back up production, run `npx supabase db push --linked --dry-run`, review it, then push.
5. Deploy the matching application version. Check Discord sign-in, that people only see their own match, and the sending queue.
6. Turn scheduled sending back on.

## Rolling back

Prefer redeploying the previous application version while you prepare a fix. Restore a backup only when necessary, and into a separate project first.

Restoring old delivery records can resend DMs. Stop scheduled sending and reconcile sent and uncertain deliveries before resuming. A restore never changes locked-in matches by itself.

## Sending troubleshooting

**Send everyone their match** queues one DM per person and sends them in batches while the exchange page is open. If you leave, progress is saved: choose **Resume sending** when you return, or let the scheduled job (`GET /api/notifications`) continue. Drawing, checking and locking in never send anything. The delivery list shows who each DM goes to, never their match.

| Status                   | Meaning                                                                   | What to do                                                              |
| ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| DMs closed               | The person blocks DMs from server members or the bot, or shares no server | Ask them to allow DMs, then **Try failed ones again**                   |
| Discord asked us to wait | Rate limited; the cooldown is saved                                       | Nothing; sending continues after the cooldown                           |
| Might have been sent     | Discord may have delivered the message but didn't confirm it              | Check with the person before retrying, since a retry could duplicate it |
| Discord unavailable      | Network, token or Discord outage                                          | Check the bot token and Discord status, then retry                      |

Each DM record is unique per person and exchange, is claimed with an exclusive lease, and uses Discord's nonce deduplication. Distributed HTTP can't guarantee exactly-once delivery, so retries that might duplicate a message ask for confirmation first. Each record is retried at most ten times, and sent records are never queued again.

## Deleting exchanges

Admins can delete an exchange or past year from the bottom of its page by typing its exact name. Deletion is permanent and removes its matches from the history used for future draws. It's refused while a batch of DMs for that exchange is in flight. People and wishlists are kept.
