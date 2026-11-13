/**
 * Description:  Starts Discord sign-in through Supabase.
 * Author:       Alex Wu
 * Dependencies: next, server/supabase.ts, server/env.ts
 * Usage:
 */
import { NextRequest, NextResponse } from 'next/server';
import { sessionClient } from '@/server/supabase';
import { appUrl, configured, AFTER_SIGN_IN_COOKIE } from '@/server/env';
export async function GET(request: NextRequest) {
  if (!configured()) return NextResponse.redirect(`${appUrl()}/login?error=configuration`);
  const client = await sessionClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: `${appUrl()}/auth/callback`,
      scopes: 'identify email',
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) return NextResponse.redirect(`${appUrl()}/login?error=oauth`);
  const response = NextResponse.redirect(data.url);
  // remember to return to /setup in a cookie, since Supabase only accepts exact redirect addresses
  if (request.nextUrl.searchParams.get('next') === 'setup')
    response.cookies.set(AFTER_SIGN_IN_COOKIE, 'setup', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 600,
    });
  return response;
}
