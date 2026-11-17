# Security

## Identity and access

Supabase SSR uses PKCE, HttpOnly SameSite=Lax cookies, a fixed configured callback origin, session refresh in the Next.js proxy, and server-side `getUser()` validation. The application accepts only Discord identities. The database independently reads `auth.identities.provider_id` for the authenticated UUID. Editable metadata supplies a cosmetic display name only.

Every private page is dynamic. Protected reads and mutations reauthorize server-side; the shared layout is not the only gate. Every browser mutation requires the exact `Origin` configured in `APP_URL`. The one exception is the return from Discord's bot invite (`GET /bot/added`), which can set up a server. It acts only when the `state` in the address matches a random value kept in an HttpOnly cookie from the start of that invite, only for the owner, and only after Discord confirms the bot is in the server; the server ID in the address is treated as a hint. API operations are explicitly allowlisted and validated with Zod. Errors omit database internals and request payloads. No assignment or token logging is implemented.

The service-role client is created in `server-only` modules, without persisted sessions. Each operation is its own service-only database function (`public.ssbu_<operation>(actor, payload)`). It receives only the UUID verified by the server, derives the Discord identity through shared `ssbu_private` checks, and enforces owner/member/admin roles again. Adding a Discord server is owner-only in the database, because nothing there can prove someone else controls a server. Read operations take no group row lock; writes serialize on it. Public RPC execution is revoked from PUBLIC, anon, and authenticated. These RPCs are infrastructure for the trusted server, not browser APIs.

RLS is enabled on every application table. Authenticated direct reads are restricted by group membership, own identity, or current recipient relationship. Direct browser writes are revoked. Private candidates, imports, history audit, and rate-limit records have no authenticated SELECT policy. The unexposed helper schema contains narrowly scoped security-definer predicates with an empty search path and explicit grants. Every privileged public function has an empty search path and service-role-only execution.

## Spoiler boundaries

- Candidate and history mappings are loaded only by trusted server code to run the pure solver.
- The browser receives aggregate draw diagnostics, its own recipient, and that recipient’s wishlist.
- Group administrators do not receive an assignment map through the exchange API.
- Chain inspection requires database admin authorization, then validates start/count/acknowledgments in the server domain layer. It serializes only requested connections.
- Participating admins start at themselves. Nonparticipating admins explicitly choose a start and acknowledge the warning. Full-circle requests require a second acknowledgment.
- Hide matches clears fetched connections from frontend state. Previously revealed information cannot be erased from a person’s memory or browser developer tools.
- The instance owner/database operator controls the infrastructure and can technically query stored assignments. Spoiler protection is an application behavior, not encryption against the database operator.

## Transaction boundaries

The singleton owner row guarantees one successful first claim. Setup attempts are persisted before secret comparison so a rejected claim cannot roll back its rate limit.

Group changes and finalization serialize on a group row lock. Candidates record both exchange and group-history revisions. Participant changes clear candidates/reports; another finalization or historical correction invalidates stale candidates. Finalization independently validates the candidate, inserts unique giver/recipient edges, and changes state in one database transaction. Notifications are separate transactions and never change a draw.

Draft chain review and the dashboard's finalization operation require the exact candidate creation timestamp. Regeneration therefore cannot silently substitute a different draw after review. Service-only review functions authorize the actor independently; the application server returns only the requested chain connections. Browser responses never contain the full candidate map by default. Delivery progress returns giver statuses and aggregate counts without recipient mappings. Foreground batch processing starts only after an explicit administrator send or resume action.

The engine uses bounded randomized backtracking over a Hamiltonian cycle with a node and elapsed-time budget. Strict/recent restrictions are never relaxed. Minimize mode searches by repeated-edge count first, then recency penalty; it reports when the budget prevents proving optimality. A valid candidate found within the budget may be used with that disclosure.

Exchange deletion uses a separate service-only RPC bound to the server-verified actor. The database checks the protected Discord identity, group administration rights, and exact name confirmation. Group and delivery row locks serialize deletion with changes and SKIP LOCKED notification claims; active send leases prevent deletion. All dependent records are removed in one transaction and the group's history revision increments to invalidate pending candidates.

## External integrations

The bot uses Discord REST v10, never Gateway or command handlers. Discord IDs are validated strings. Guild membership comes from Discord, not a client assertion. Rate limits return their actual cooldown rather than causing long blocking sleeps. Delivery messages contain ordinary authenticated-dashboard links, no login credentials.

DM processing leases at most five jobs per invocation and stops early for serverless time limits. Only a matching active lease may save a result. Uncertain requests and expired leases require explicit review/retry. All automated Discord tests use mocked transports; no real messages are sent.
