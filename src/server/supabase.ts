/**
 * Description:  Supabase clients and helpers for calling the service-only database functions.
 * Author:       Alex Wu
 * Dependencies: server-only, @supabase/ssr, @supabase/supabase-js, next, server/env.ts
 * Usage:
 */
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from './env';
export async function sessionClient() {
  const jar = await cookies();
  return createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            // server components can't set cookies, so the proxy refreshes them instead
          }
        },
      },
    },
  );
}
export function privilegedClient() {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function actor() {
  const client = await sessionClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AppError('Sign in with Discord to continue.', 401);
  if (!data.user.identities?.some((i) => i.provider === 'discord'))
    throw new AppError('Discord authentication is required.', 403);
  return data.user;
}
/**
 * Gets the person's Discord display name, or their username if they haven't set one. Supabase
 * stores the display name as custom_claims.global_name and the username as full_name. Never used
 * for identity, which comes from auth.identities.
 */
export function displayName(user: Pick<User, 'user_metadata'>): string {
  const meta = user.user_metadata ?? {};
  return String(meta.custom_claims?.global_name || meta.full_name || 'Discord member').slice(
    0,
    100,
  );
}
/** Gets the person's Discord user id from their verified Discord identity. */
export function discordId(user: Pick<User, 'identities'>): string | undefined {
  return user.identities?.find((i) => i.provider === 'discord')?.id;
}
/** Calls one of the service-only `ssbu_<name>(actor, payload)` database operations. */
export async function operation<T = unknown>(
  name: string,
  actorId: string,
  payload: unknown = {},
): Promise<T> {
  return rpc<T>(`ssbu_${name}`, { actor: actorId, payload });
}
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await privilegedClient().rpc(name, args);
  if (error) {
    if (error.code === '42501') throw new AppError(error.message, 403);
    if (error.code === 'P0001') throw new AppError(error.message, 409);
    if (['23505', '23503', '23514', '22P02'].includes(error.code))
      throw new AppError(
        'The data conflicts with an existing record or contains invalid values.',
        400,
      );
    throw new AppError(
      'The database operation could not be completed. Check the installation migrations.',
      503,
    );
  }
  return data as T;
}
