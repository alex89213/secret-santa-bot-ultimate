/**
 * Description:  Scheduled endpoint that sends waiting assignment DMs, protected by CRON_SECRET.
 * Author:       Alex Wu
 * Dependencies: next, server/service.ts, server/notifications.ts
 * Usage:        GET /api/notifications with the header Authorization: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { matchesSecret } from '@/server/service';
import { processDeliveries } from '@/server/notifications';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    secret.length < 32 ||
    !matchesSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await processDeliveries(undefined, 5));
  } catch {
    return NextResponse.json({ error: 'Delivery processing failed.' }, { status: 503 });
  }
}
