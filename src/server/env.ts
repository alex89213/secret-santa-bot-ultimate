/**
 * Description:  Reads the server settings from environment variables.
 * Author:       Alex Wu
 * Dependencies: server-only
 * Usage:
 */
import 'server-only';
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
/**
 * Gets the site's public origin. On Vercel, APP_URL is optional and falls back to the project's
 * production address, and a localhost APP_URL copied from .env.local is ignored.
 */
/** Cookie that remembers where to go after Discord sign-in. Only `setup` is ever stored. */
export const AFTER_SIGN_IN_COOKIE = 'ssbu-after-sign-in';
export function appUrl() {
  const onVercel = process.env.VERCEL === '1';
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  let value = process.env.APP_URL;
  // a localhost address is never right on Vercel, so use the production address instead
  if (onVercel && production && (!value || new URL(value).hostname === 'localhost'))
    value = `https://${production}`;
  const url = new URL(value || 'http://localhost:3000');
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    url.hostname !== 'localhost'
  )
    throw new Error('APP_URL must use HTTPS in production.');
  return url.origin;
}
