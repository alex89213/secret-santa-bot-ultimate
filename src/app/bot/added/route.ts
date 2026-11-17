/**
 * Description:  Where Discord sends the person after they add the bot. Sets up the server on the
 *               site straight away and opens it, using the server ID and name from Discord.
 * Author:       Alex Wu
 * Dependencies: next, node:crypto, server/env.ts, server/invite.ts, server/service.ts,
 *               server/supabase.ts, domain/types.ts
 * Usage:        GET /bot/added?guild_id=…&state=… (from Discord)
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { appUrl } from '@/server/env';
import { INVITE_STATE_COOKIE } from '@/server/invite';
import { execute } from '@/server/service';
import { actor, operation, displayName, AppError } from '@/server/supabase';
import type { Context } from '@/domain/types';
const same = (a: string, b: string) => {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
};
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get('state') ?? '';
  const expected = request.cookies.get(INVITE_STATE_COOKIE)?.value ?? '';
  const guildId = params.get('guild_id') ?? '';
  const go = (path: string) => {
    const response = NextResponse.redirect(`${appUrl()}${path}`);
    response.cookies.delete({ name: INVITE_STATE_COOKIE, path: '/bot' });
    return response;
  };
  // the person closed Discord's screen, or the link didn't come from an invite we started
  if (params.get('error')) return go('/servers');
  if (!expected || !state || !same(state, expected)) return go('/servers?invite=expired');
  if (!/^[1-9][0-9]{16,19}$/.test(guildId)) return go('/servers?invite=failed');
  try {
    const user = await actor();
    const ctx = await operation<Context>('context', user.id, { display_name: displayName(user) });
    const existing = ctx.groups.find((g) => g.guild_id === guildId);
    if (existing) return go(`/groups/${existing.id}`);
    // only the owner sets up servers; anyone else has added the bot and the owner finishes it
    if (!ctx.owner) return go('/servers?invite=owner');
    // the server ID in the address is only a hint, so activate_group checks it with Discord
    const group = (await execute(user, {
      operation: 'activate_group',
      payload: { guild_id: guildId },
    })) as { id: string };
    return go(`/groups/${group.id}`);
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return go('/login');
    return go('/servers?invite=failed');
  }
}
