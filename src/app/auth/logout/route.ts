/**
 * Description:  Signs the person out after checking the request came from this site.
 * Author:       Alex Wu
 * Dependencies: next, server/supabase.ts, server/env.ts
 * Usage:
 */
import { NextRequest, NextResponse } from 'next/server';
import { sessionClient } from '@/server/supabase';
import { appUrl } from '@/server/env';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== appUrl())
    return new NextResponse('Invalid origin', { status: 403 });
  const client = await sessionClient();
  await client.auth.signOut({ scope: 'local' });
  return NextResponse.redirect(`${appUrl()}/login`, 303);
}
