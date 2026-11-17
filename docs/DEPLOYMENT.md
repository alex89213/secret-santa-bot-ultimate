# Deployment

[Setup](SETUP.md) covers the main path: deploying from your computer with the Vercel CLI. This page covers updates, automatic deploys from GitHub, custom domains, scheduled sending and other hosts.

Each installation is independent. It has its own website, Supabase project, Discord bot, owner and data. There's no central service.

## Updating

```sh
git pull
npm ci
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx vercel deploy --prod
```

The dry run lists any new migrations. Back up first if there are any (see [Operations](OPERATIONS.md#backups)). Push the migrations before deploying the new code, since new code can rely on them.

## Deploying automatically from GitHub

Instead of the CLI, you can import the repository in the Vercel dashboard with **Add New → Project**. Vercel then deploys every push to your production branch.

Set the same environment variables as in [Setup](SETUP.md#5-deploy-to-vercel) under **Settings → Environment Variables**. Add the Supabase and Discord redirects for your site's address as in [step 6](SETUP.md#6-tell-supabase-and-discord-your-sites-address).

## Custom domain

Add the domain in Vercel under **Settings → Domains**. Then:

1. Set `APP_URL` in Vercel to the exact address, for example `https://santa.example.org`, with no trailing slash.
2. In Supabase, change the Site URL and add `https://santa.example.org/auth/callback` to the redirect URLs.
3. In the Discord application's **OAuth2** settings, add the redirect `https://santa.example.org/bot/added`.
4. Deploy again.

## Environment variables

| Variable                               | Needed        | What it is                                                               |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes           | Your Supabase project URL                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes           | Supabase publishable key (or the legacy `anon` key)                      |
| `SUPABASE_SERVICE_ROLE_KEY`            | Yes           | Supabase secret key (or the legacy `service_role` key)                   |
| `DISCORD_BOT_TOKEN`                    | Yes           | The bot's token                                                          |
| `INSTANCE_SETUP_SECRET`                | Yes           | At least 32 random characters, used once to claim the site               |
| `CRON_SECRET`                          | Recommended   | At least 32 random characters, protects scheduled sending                |
| `APP_URL`                              | Not on Vercel | The site's exact address. Required on other hosts and for custom domains |

`npm run vercel:env` checks these and sends them to the linked Vercel project from `.env.production.local`. Only the two `NEXT_PUBLIC_` values reach the browser. Settings are read when the site starts, so deploy again after changing any of them.

## Scheduled sending

**Send everyone their match** sends DMs in batches while the exchange page is open. If the page is closed partway through, the rest wait until either the admin chooses **Resume sending**, or a scheduled request to `GET /api/notifications` sends them.

On Vercel, `vercel.json` schedules that request once a day, which is the most the free plan allows. Vercel sends `CRON_SECRET` with it automatically. Each request sends up to five DMs.

On other hosts, call the endpoint from your own scheduler:

```sh
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-SITE/api/notifications
```

## Docker

```sh
docker build -t secret-santa-bot-ultimate .
docker run --env-file .env.local -p 3000:3000 secret-santa-bot-ultimate
```

Or `docker compose up --build -d`. The image runs as an unprivileged user and reads its settings when it starts, so no secrets are built into it. Put it behind an HTTPS reverse proxy, set `APP_URL` to the public HTTPS address, and make sure the proxy passes cookies through and doesn't cache pages.

## Other Node hosts

```sh
npm ci
npm run build
npm start
```

Use Node.js 24, run it under a process manager behind HTTPS, and set `APP_URL`.

## Before going live

Sign in with a real Discord account and send one test DM to yourself before inviting everyone. The automated tests fake Discord, so they can't catch a wrong bot token, a missing intent or someone's DM settings.
