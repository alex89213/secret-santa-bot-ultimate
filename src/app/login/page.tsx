/**
 * Description:  Sign-in page with the corner artwork and falling snow.
 * Author:       Alex Wu
 * Dependencies: next, server/env.ts, components/decor.tsx, components/snowfall.tsx
 * Usage:
 */
import Link from 'next/link';
import { configured } from '@/server/env';
import { CornerArt } from '@/components/decor';
import { Snowfall } from '@/components/snowfall';
export const dynamic = 'force-dynamic';
const ERRORS: Record<string, string> = {
  configuration:
    'This site isn’t connected to its database yet. The operator needs to finish setup.',
  callback: 'Discord sign-in couldn’t be verified. Try again.',
};
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const toSetup = next === 'setup';
  const ready = configured();
  return (
    <main id="main" className="standalone snow-edge">
      <Snowfall />
      <CornerArt />
      <div className="content">
        <h1>Secret Santa</h1>
        <p>Draw names, share wishlists, and get your match by Discord DM.</p>
        {error && (
          <p role="alert" className="notice error">
            {ERRORS[error] ?? 'Discord sign-in is unavailable right now. Try again.'}
          </p>
        )}
        {toSetup && (
          <p className="notice">
            Sign in with Discord first. You’ll come back here to claim the site.
          </p>
        )}
        {ready ? (
          <a className="btn primary big" href={toSetup ? '/auth/login?next=setup' : '/auth/login'}>
            Sign in with Discord
          </a>
        ) : (
          <p className="notice">Sign-in opens once the operator connects the database.</p>
        )}
        <p className="meta">
          Setting up a new site?{' '}
          <Link className="btn link" href="/login?next=setup">
            Claim ownership
          </Link>
        </p>
      </div>
    </main>
  );
}
