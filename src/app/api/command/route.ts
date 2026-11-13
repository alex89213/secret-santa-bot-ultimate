/**
 * Description:  Single POST endpoint for every browser action. Checks the origin, size and session,
 *               validates the command, then runs it.
 * Author:       Alex Wu
 * Dependencies: next, zod, server/supabase.ts, server/env.ts, server/validation.ts,
 *               server/service.ts, domain/draw.ts, domain/privacy.ts, server/discord.ts
 * Usage:        POST /api/command with { operation, payload }
 */
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { actor, AppError } from '@/server/supabase';
import { appUrl } from '@/server/env';
import { parseCommand } from '@/server/validation';
import { execute } from '@/server/service';
import { DrawError } from '@/domain/draw';
import { AccessError } from '@/domain/privacy';
import { DiscordError } from '@/server/discord';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('origin') !== appUrl())
      throw new AppError('Invalid request origin.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new AppError('JSON content required.', 415);
    const user = await actor();
    if (Number(request.headers.get('content-length')) > 64 * 1024)
      throw new AppError('Request is too large.', 413);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) {
          await reader.cancel();
          throw new AppError('Request is too large.', 413);
        }
        chunks.push(value);
      }
    const body = Buffer.concat(chunks).toString('utf8');
    const parsed = parseCommand(JSON.parse(body));
    return NextResponse.json(
      { data: await execute(user, parsed) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    let message = 'The request could not be completed.',
      status = 500;
    if (error instanceof AppError) {
      message = error.message;
      status = error.status;
    } else if (error instanceof DrawError || error instanceof AccessError) {
      message = error.message;
      status = 409;
    } else if (error instanceof DiscordError) {
      message = error.message;
      status = error.status === 429 ? 429 : 502;
    } else if (error instanceof ZodError) {
      message = error.issues[0]?.message ?? 'Invalid input.';
      status = 400;
    } else if (error instanceof SyntaxError) {
      message = 'Invalid JSON request.';
      status = 400;
    }
    return NextResponse.json(
      { error: message },
      {
        status,
        headers: {
          'Cache-Control': 'private, no-store',
          ...(error instanceof DiscordError && error.status === 429
            ? { 'Retry-After': String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
