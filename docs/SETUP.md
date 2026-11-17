# Set up your own site

This guide takes you from nothing to a working Secret Santa site on Vercel, with Supabase for the database and sign-in and a Discord bot for DMs. It takes about 30 minutes. Do the steps in order, since later steps need values from earlier ones.

## Before you start

You need:

- free accounts on [Discord](https://discord.com), [Supabase](https://supabase.com) and [Vercel](https://vercel.com),
- [Node.js 24](https://nodejs.org) and [Git](https://git-scm.com),
- a Discord server you can manage, for the bot.

Get the code and install it:

```sh
git clone https://github.com/alex89213/secret-santa-bot-ultimate
cd secret-santa-bot-ultimate
npm ci
```

You'll collect a few values from Supabase and Discord along the way. Step 5 has a command that creates a private file for them, `.env.production.local`, which is never committed or uploaded. Here's where each value comes from:

| Value                    | Where it comes from       | Where it goes                                     |
| ------------------------ | ------------------------- | ------------------------------------------------- |
| Supabase project URL     | Step 1                    | `NEXT_PUBLIC_SUPABASE_URL`                        |
| Supabase publishable key | Step 1                    | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            |
| Supabase secret key      | Step 1                    | `SUPABASE_SERVICE_ROLE_KEY`                       |
| Discord bot token        | Step 3                    | `DISCORD_BOT_TOKEN`                               |
| Discord client ID        | Step 3                    | Supabase Discord provider                         |
| Discord client secret    | Step 3                    | Supabase Discord provider                         |
| Setup secret             | Generated for you, step 5 | `INSTANCE_SETUP_SECRET`, then entered at `/setup` |
| Cron secret              | Generated for you, step 5 | `CRON_SECRET`                                     |
| Site address             | Vercel, in step 5         | Supabase and Discord settings in step 6           |

## 1. Create the Supabase project

1. In the [Supabase dashboard](https://supabase.com/dashboard), choose **New project**. Save the database password it asks for, since step 2 needs it.
2. When the project is ready, open **Project Settings → API Keys**:
   - copy the **Publishable key** (starts with `sb_publishable_`),
   - under **Secret keys**, copy the secret key (starts with `sb_secret_`), creating one if there isn't one yet.

   Keep the secret key private. It bypasses every permission rule in the database.

3. Note the project URL, `https://YOUR-REF.supabase.co`. It's under **Project Settings → Data API**, or in the **Connect** dialog. `YOUR-REF` is the project's reference ID, which also appears in the dashboard's address bar.

If your project shows **Legacy API Keys** instead, the `anon` key works as the publishable key and the `service_role` key works as the secret key.

## 2. Create the database tables

From the project folder:

```sh
npx supabase login
npx supabase link --project-ref YOUR-REF
npx supabase db push --linked
```

`link` asks for the database password from step 1. `db push` lists the migration in `supabase/migrations` and asks before applying it.

## 3. Create the Discord application and bot

In the [Discord Developer Portal](https://discord.com/developers/applications), choose **New Application**.

1. On the **Bot** page:
   - choose **Reset Token** and copy the token,
   - turn on **Server Members Intent** and save. The site lists server members through Discord's API, which needs this.
2. On the **OAuth2** page:
   - copy the **Client ID**,
   - choose **Reset Secret** and copy the **Client Secret**,
   - under **Redirects**, add `https://YOUR-REF.supabase.co/auth/v1/callback` and save.

## 4. Set up sign-in in Supabase

In the Supabase dashboard, go to **Authentication → Sign In / Providers**:

1. Open **Discord**, turn it on, paste the client ID and client secret from step 3, and save.
2. Open **Email** and turn it off. It's on by default in new projects.
3. Leave **Allow new users to sign up** on. Turning it off blocks first-time Discord sign-ins too.

Phone and anonymous sign-ins are off by default. Leave them off. The site only accepts Discord sign-ins either way.

## 5. Deploy to Vercel

Log in and create the Vercel project:

```sh
npx vercel login
npx vercel link
```

When `link` asks, choose to create a new project. It detects Next.js on its own.

Create the settings file:

```sh
npm run vercel:env
```

The first run creates `.env.production.local` with the setup secret and cron secret already generated. Open it and fill in the four blank values from steps 1 and 3. Leave `APP_URL` blank, since Vercel finds its own address. Then run the same command again:

```sh
npm run vercel:env
```

It checks every value first and sends nothing if one is missing, too short or in the wrong place, such as the two Supabase keys swapped. When everything passes, it sends the values to Vercel without printing them.

Deploy:

```sh
npx vercel deploy --prod
```

When it finishes, it prints `Production URL: https://YOUR-SITE.vercel.app`. That's your site's address. Always deploy with `--prod`. Preview deployments have a different address, so Discord sign-in won't work on them.

To change a setting later, edit `.env.production.local`, run `npm run vercel:env` again, then deploy again.

## 6. Tell Supabase and Discord your site's address

In Supabase, go to **Authentication → URL Configuration**:

1. Set **Site URL** to `https://YOUR-SITE.vercel.app`.
2. Under **Redirect URLs**, add `https://YOUR-SITE.vercel.app/auth/callback`.

New projects start with a Site URL of `http://localhost:3000`. Replace it, since sign-in sends people back to the Site URL when it doesn't recognize an address.

Then, in the Discord Developer Portal, open your application's **OAuth2** page. Under **Redirects**, add `https://YOUR-SITE.vercel.app/bot/added` next to the one from step 3 and save. It sends you back to the site after you invite the bot, so your server is set up for you.

## 7. Claim the site and add your server

1. Open `https://YOUR-SITE.vercel.app` and choose **Sign in with Discord**.
2. Go to `https://YOUR-SITE.vercel.app/setup` and enter the setup secret, `INSTANCE_SETUP_SECRET` in `.env.production.local`. The first person to do this becomes the owner, and it only works once.
3. On the **Servers** page, choose **Invite the bot** and pick your server in Discord. You come straight back to the site with the server set up and named. The bot needs no permissions. It only reads the member list and sends DMs.
4. Open the server, go to **People**, and add everyone taking part. They don't need to have signed in yet.

If the bot is already in your server, the server shows up on the **Servers** page under **Ready to set up** instead. You can also add a server by its ID there.

You're ready to run an exchange. On **Exchanges**, create one, pick who's taking part, **Draw names**, **Lock in matches**, then **Send everyone their match**. To record years from before you used the site, use the server's **History** tab.

## If something goes wrong

| What happens                                  | Check                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Signing in sends you to `localhost`           | Supabase Site URL and Redirect URLs (step 6)                                                     |
| Signing in says the redirect is invalid       | The Discord OAuth2 redirect is exactly `https://YOUR-REF.supabase.co/auth/v1/callback`           |
| Inviting the bot says the redirect is invalid | `https://YOUR-SITE.vercel.app/bot/added` is listed under Discord **OAuth2 → Redirects** (step 6) |
| "Discord sign-in couldn't be verified"        | The Discord provider's client ID and secret in Supabase (step 4)                                 |
| The login page says the site isn't connected  | The three Supabase values, then `npm run vercel:env` and deploy again                            |
| Adding the server fails                       | The bot is in the server (step 7), and the ID is the server's, not a channel's                   |
| The setup secret is rejected as too short     | Run `npm run vercel:env`, then deploy again                                                      |
| The site can't reach Discord for the invite   | `DISCORD_BOT_TOKEN` is set correctly                                                             |
| No people show up on the People tab           | Server Members Intent is on (step 3)                                                             |
| Someone doesn't get a DM                      | They allow DMs from server members in that server's privacy settings                             |

After changing any setting, deploy again for it to take effect.
