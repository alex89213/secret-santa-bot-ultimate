# Specification

## Purpose

A self-hosted Secret Santa site for Discord communities. Everything happens on the website. The Discord bot only reads server members and sends DMs over the REST API. There are no slash commands and no always-on Gateway connection.

## Roles

- **Owner.** The first person to enter the setup secret at `/setup`. There is exactly one. The owner adds Discord servers and chooses each server's admins.
- **Admins.** Set per server. Admins add people, run exchanges, record past years, check draws and send DMs.
- **Members.** See their own exchanges, their own match and that person's wishlist, and edit their own wishlist.

A person's Discord ID, read from Supabase Auth's identity record, is what links them to a server, even before they've ever signed in. Display names are cosmetic.

Names are labels only, so renaming in Discord never affects permissions, matches or wishlists:

- The account menu shows the person's Discord display name, or their username if they haven't set one. It updates on every page load.
- People lists and matches show the name Discord shows in that server: the server nickname, then the display name, then the username. Saved names are updated whenever an admin has the server's People tab open.
- DMs mention people by Discord ID, so Discord always shows their current name.

## Servers, people and exchanges

Each Discord server is one group with its own people and history. People are added from the live server member list, or by Discord user ID after the bot confirms they're in the server. Removing someone keeps their past exchanges intact.

Exchanges are kept in order within each server. A new exchange goes last. A past year is placed after an exchange the admin picks. Exchange names don't need to be unique.

A live exchange moves through three states:

1. **Drawing names** (`draft`): pick people, draw, redraw and check the draw.
2. **Matched** (`finalized`): matches are locked in and can't change. DMs can be sent.
3. **Done** (`completed`): marked by an admin once gifts are exchanged.

## Past years

Admins record years from before they used the site. A past year lists everyone who took part and whichever matches are known, picked from the server's people.

- **Past-only people** can be added for someone who has left the server or never used Discord. A past-only person has a name and an optional Discord ID. They count toward the past year's check, but never get access, never join a new draw and never get a DM. If they later join the server with the same Discord ID, they become a regular member.
- A past year is **Complete** when its matches form one circle through everyone listed, and **Partial** otherwise. Partial years still count when avoiding repeats.
- Matches are checked before saving: nobody gives to themselves, nobody gives or receives twice, and every match is between people in that year.
- Correcting a past year replaces its people and matches. The previous version is kept in a private audit record.

## The draw

Between 2 and 200 people form exactly one gift circle. Everyone gives once and receives once, and nobody draws themselves. Each exchange has a repeat rule:

- **Never repeat a past match.** No giver gets someone they've had before.
- **Avoid matches from the last N exchanges.** Only the most recent N exchanges with recorded matches count.
- **Allow repeats if there's no other way.** Repeats are kept to the fewest possible, and older repeats are preferred over recent ones.

The solver runs on the server with a time and step budget. It tells apart "no circle is possible" from "ran out of budget", and says when it couldn't prove a draw has the fewest possible repeats. The database checks every draw again before saving it and again when it's locked in.

Admins see a summary of the draw (how many people, whether it's one circle, how many repeats), never the matches themselves.

## Check matches

Admins can look at part of a draw before or after locking it in.

- An admin taking part starts from their own match.
- An admin not taking part picks a starting person and confirms they understand it reveals other people's matches.
- Each step reveals one more match. Seeing the whole circle needs a separate confirmation.
- The server sends only the matches asked for. **Hide matches** clears them from the page.
- Members can't use this tool.

Locking in is tied to the exact draw that was checked. If someone redraws in the meantime, locking in fails and asks for a refresh.

## Wishlists

Each person has one wishlist, shared across all their servers. Items have a title, optional details, an optional link and an optional rough price, up to 100 items. The list is numbered, most wanted first, and its owner reorders it. Only the owner and whoever has drawn them in a matched or done exchange can see it.

## Wishlist reminders

While an exchange is drawing names or matched, admins see which of its people haven't added anything to their wishlist. They see only whether a wishlist is empty, never what's on it. **Remind them on Discord** DMs those people a link to their wishlist page. Each exchange allows one reminder round an hour, enforced in the database.

## Sending matches

After matches are locked in, an admin chooses **Send everyone their match** and confirms. Each person gets a DM with the exchange name, their match, the budget if there is one, and a link to the site.

- Each person and exchange has one delivery record: waiting, sending, sent or not sent.
- The page keeps sending in small batches while it's open. A scheduled job (`/api/notifications`) can continue in the background.
- Discord rate limits are saved and respected.
- Failed DMs are only retried when an admin asks. A DM that might have arrived without confirmation needs an extra confirmation before retrying.
- Each delivery is tried at most ten times. Sent DMs are never queued again.
- The delivery list shows who each DM goes to, never their match.

## Deleting

Admins delete an exchange or past year by typing its exact name. Its people list, matches, draw and DM records go with it, and its matches stop counting for future draws. People and wishlists stay. Deleting is refused while a batch of DMs for that exchange is being sent. DMs already sent stay in Discord.

## Technology

Next.js App Router, React, strict TypeScript, Supabase Auth and PostgreSQL with row-level security, the Discord REST API, Vitest and Playwright. The solver and privacy rules in `src/domain` don't depend on Next.js, Supabase or Discord. Privileged code lives in `server-only` modules. Vercel with Supabase Cloud is the main deployment target, and Docker and plain Node hosting also work.
