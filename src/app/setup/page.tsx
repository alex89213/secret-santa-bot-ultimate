/**
 * Description:  Page where the first person to enter the setup secret becomes the site owner.
 * Author:       Alex Wu
 * Dependencies: next, server/pages.ts, components/setup.tsx, components/snowfall.tsx
 * Usage:
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { optionalUser, pageContext } from '@/server/pages';
import { SetupForm } from '@/components/setup';
import { Snowfall } from '@/components/snowfall';
export const dynamic = 'force-dynamic';
export default async function Setup() {
  // claiming the site needs a Discord sign-in first, and sign-in returns here afterwards
  if (!(await optionalUser())) redirect('/login?next=setup');
  const ctx = await pageContext();
  return (
    <main id="main" className="standalone snow-edge">
      <Snowfall />
      <div className="content">
        <h1 className="small">Claim this site</h1>
        <section className="card">
          {ctx.setup_available ? (
            <>
              <p>
                You’re signed in as {ctx.user.display_name}. Enter the setup secret from the
                server’s environment to become the owner. This works once.
              </p>
              <SetupForm />
            </>
          ) : (
            <>
              <p>This site already has an owner.</p>
              <Link className="btn primary" href="/dashboard">
                Go to Home
              </Link>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
