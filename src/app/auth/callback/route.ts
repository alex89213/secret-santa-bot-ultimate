/**
 * Description:  Finishes Discord sign-in and keeps the session only when it has a Discord identity.
 * Author:       Alex Wu
 * Dependencies: next, server/supabase.ts, server/env.ts
 * Usage:
 */
import { NextRequest, NextResponse } from 'next/server';
import { sessionClient } from '@/server/supabase';
import { appUrl, AFTER_SIGN_IN_COOKIE } from '@/server/env';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code && code.length < 4096) {
    const client = await sessionClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await client.auth.getUser();
      if (data.user?.identities?.some((i) => i.provider === 'discord')) {
        const setup = request.cookies.get(AFTER_SIGN_IN_COOKIE)?.value === 'setup';
        const response = NextResponse.redirect(`${appUrl()}${setup ? '/setup' : '/dashboard'}`);
        response.cookies.delete({ name: AFTER_SIGN_IN_COOKIE, path: '/auth' });
        return response;
      }
      await client.auth.signOut();
    }
  }
  return NextResponse.redirect(`${appUrl()}/login?error=callback`);
}
