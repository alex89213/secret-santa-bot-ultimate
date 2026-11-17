/**
 * Description:  Helpers server pages use to get the signed-in user and read private data.
 * Author:       Alex Wu
 * Dependencies: server-only, react, next, server/supabase.ts, server/env.ts, domain/types.ts
 * Usage:
 */
import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { actor, operation, displayName, AppError } from './supabase';
import { DiscordRest } from './discord';
import { configured } from './env';
import type { Context } from '@/domain/types';
/** Gets the signed-in user, or null when nobody is signed in. Checked once per request. */
export const optionalUser = cache(async () => {
  if (!configured()) redirect('/login?error=configuration');
  try {
    return await actor();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return null;
    throw error;
  }
});
/** Gets the signed-in user and sends anyone signed out to the login page. */
async function pageUser() {
  const user = await optionalUser();
  if (!user) redirect('/login');
  return user;
}
/** Saves the display name and gets the person's groups, once per request. */
export const pageContext = cache(async () => {
  const user = await pageUser();
  return operation<Context>('context', user.id, { display_name: displayName(user) });
});
/**
 * Lists the servers the bot is in, for one-click setup. Returns null when Discord can't be reached,
 * so the page still loads.
 */
export const botServers = cache(async () => {
  try {
    return await new DiscordRest().guilds();
  } catch {
    return null;
  }
});
/** Reads a private resource and shows a 404 for anything the person can't see. */
export async function resource<T>(name: string, payload: unknown = {}): Promise<T> {
  const user = await pageUser();
  try {
    return await operation<T>(name, user.id, payload);
  } catch (error) {
    if (error instanceof AppError && [400, 403].includes(error.status)) notFound();
    throw error;
  }
}
