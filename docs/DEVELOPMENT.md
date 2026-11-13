# Local development

Run the whole site on your computer against a local Supabase stack. You need Node.js 24 and Docker.

```sh
npm ci
npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
node scripts/local-env.mjs
npm run dev
```

`scripts/local-env.mjs` writes `.env.local` with the local stack's keys and new random secrets. It never overwrites an existing file and doesn't print the secrets. The site runs at http://localhost:3000.

## Signing in locally

Signing in needs a Discord application. Use a separate one from your live site.

1. In the Discord app's **OAuth2** settings, add the redirect `http://127.0.0.1:54321/auth/v1/callback`.
2. In `supabase/config.toml`, set `enabled = true` under `[auth.external.discord]`.
3. Set `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` in your shell, then restart the stack with `npx supabase stop` and the `start` command above.
4. Add `DISCORD_BOT_TOKEN` to `.env.local` to load server members and send DMs.

## Checks

```sh
npm run lint
npm run typecheck
npm test              # unit tests
npm run test:db       # PostgreSQL tests against the local stack
npx playwright install chromium
npm run test:e2e      # browser test, starts its own copy of the site on port 3001
npm run build
npm run check:privacy # checks the built browser files for secrets
```

The database and browser tests need a fresh local database, because they test the one-time owner claim. Run `npx supabase db reset` to start clean. It only touches the local stack. All tests fake Discord, so they never send real DMs.
