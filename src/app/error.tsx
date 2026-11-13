/**
 * Description:  Error page shown when a page fails to load.
 * Author:       Alex Wu
 * Dependencies:
 * Usage:
 */
'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="standalone snow-edge">
      <div className="content">
        <h1 className="small">This page didn’t load</h1>
        <p>Check your connection and try again. If it keeps happening, ask the site’s owner.</p>
        <button className="btn primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
