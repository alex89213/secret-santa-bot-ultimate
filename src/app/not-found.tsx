/**
 * Description:  Page shown for missing pages and for pages the person can't access.
 * Author:       Alex Wu
 * Dependencies: next
 * Usage:
 */
import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="standalone snow-edge">
      <div className="content">
        <h1 className="small">Page not found</h1>
        <p>It may not exist, or your Discord account may not have access to it.</p>
        <Link className="btn primary" href="/dashboard">
          Go to Home
        </Link>
      </div>
    </main>
  );
}
