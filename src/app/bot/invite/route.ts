/**
 * Description:  Starts adding the bot to a server. Saves a random state in a cookie, then sends the
 *               person to Discord's invite screen.
 * Author:       Alex Wu
 * Dependencies: next, node:crypto, server/discord.ts, server/env.ts, server/invite.ts,
 *               server/supabase.ts, domain/types.ts
 * Usage:        GET /bot/invite
 */
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { DiscordRest } from '@/server/discord';
import { appUrl, configured } from '@/server/env';
import { inviteUrl, INVITE_STATE_COOKIE } from '@/server/invite';
import { actor, operation, displayName } from '@/server/supabase';
import type { Context } from '@/domain/types';
export async function GET() {
  if (!configured()) return NextResponse.redirect(`${appUrl()}/login?error=configuration`);
  let manager: boolean;
  try {
    const user = await actor();
    const ctx = await operation<Context>('context', user.id, { display_name: displayName(user) });
    manager = ctx.owner || ctx.groups.some((g) => g.admin);
  } catch {
    return NextResponse.redirect(`${appUrl()}/login`);
  }
  // only the owner and admins invite the bot, so nobody else can make the site call Discord
  if (!manager) return NextResponse.redirect(`${appUrl()}/servers`);
  let clientId: string;
  try {
    clientId = (await new DiscordRest().application()).id;
  } catch {
    return NextResponse.redirect(`${appUrl()}/servers?invite=unreachable`);
  }
  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(inviteUrl(clientId, state));
  response.cookies.set(INVITE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/bot',
    maxAge: 900,
  });
  return response;
}
