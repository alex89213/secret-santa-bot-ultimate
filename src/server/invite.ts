/**
 * Description:  Builds the bot invite link that sends Discord back to the site with the server's ID,
 *               so the owner never has to copy it by hand.
 * Author:       Alex Wu
 * Dependencies: server-only, server/env.ts
 * Usage:        inviteUrl(clientId, state), then check the state on /bot/added
 */
import 'server-only';
import { appUrl } from './env';
/** Cookie holding the random state for one invite, so /bot/added only accepts invites we started. */
export const INVITE_STATE_COOKIE = 'ssbu-invite-state';
/** Where Discord returns after the bot is added. Must be listed under OAuth2 → Redirects. */
export const inviteRedirect = () => `${appUrl()}/bot/added`;
/**
 * Gets Discord's invite link. With a redirect and response_type=code, Discord sends the person back
 * with `guild_id` in the address once the bot is in the server. The code itself is never used.
 */
export function inviteUrl(clientId: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot',
    permissions: '0',
    response_type: 'code',
    redirect_uri: inviteRedirect(),
    state,
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}
