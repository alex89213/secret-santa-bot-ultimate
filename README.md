# Secret Santa Bot Ultimate

A self-hosted Secret Santa site for Discord communities. Admins draw names on the website, everyone keeps a wishlist that carries over from year to year, and a Discord bot DMs each person their match.

- **One gift circle, every time.** Everyone gives once and receives once, in a single loop with no pairs or sub-groups.
- **Remembers your history.** Never repeat a past match, avoid the last few exchanges, or allow repeats only when there's no other way. Add years from before you used the site, including people who have since left the server.
- **Spoiler-safe for admins.** Admins check a draw one match at a time without ever seeing the whole list unless they ask for it.
- **Reusable wishlists.** A numbered list, most wanted first. Only you and whoever draws your name can see it.
- **DMs that survive interruptions.** Sending is resumable, rate-limit aware and never sends twice by accident.
- **Yours to run.** Your own website, Supabase project and Discord bot. No central service, no slash commands, no always-on bot process.

## How it works

1. The site's owner signs in with Discord, claims the site once with a setup secret, and adds a Discord server.
2. An admin adds people from the server, creates an exchange, picks who's taking part, and draws names.
3. The admin can check part of the draw, then locks in the matches.
4. **Send everyone their match** DMs each person their recipient with a link to the site, where they see their match and that person's wishlist.

## Get started

Follow [Set up your own site](docs/SETUP.md). It walks through Discord, Supabase and Vercel in order and takes about 30 minutes.

To work on the code, see [Local development](docs/DEVELOPMENT.md).

## Documentation

| Guide                                    | What it covers                                                  |
| ---------------------------------------- | --------------------------------------------------------------- |
| [Setup](docs/SETUP.md)                   | Deploying your own site, step by step                           |
| [Deployment](docs/DEPLOYMENT.md)         | Updates, GitHub deploys, custom domains, Docker and other hosts |
| [Local development](docs/DEVELOPMENT.md) | Running the site and the tests on your computer                 |
| [Operations](docs/OPERATIONS.md)         | Backups, upgrades, rollback and DM troubleshooting              |
| [Specification](docs/SPEC.md)            | Roles, data model, the draw, past years, wishlists and sending  |
| [Security](docs/SECURITY.md)             | Identity, permissions and spoiler boundaries                    |
| [Design](docs/DESIGN.md)                 | Palette, type, artwork, snow and writing style                  |

## Tech stack

Next.js (App Router) · React · strict TypeScript · Supabase Auth and PostgreSQL with row-level security · Discord REST API · Zod · Vitest · Playwright.

```
src/domain   Pure logic: the draw solver, chain privacy, past-year checks
src/server   Server-only integrations: Supabase, Discord, validation, handlers
src/app      Pages and API routes
src/components  Interface components, artwork and snowfall
supabase/migrations  Versioned schema and service-only database functions
tests        Unit, real-PostgreSQL and browser tests
```

## License

[MIT](LICENSE)
