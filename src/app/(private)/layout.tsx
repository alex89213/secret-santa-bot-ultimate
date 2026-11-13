/**
 * Description:  Layout for signed-in pages that wraps them in the top bar and falling snow.
 * Author:       Alex Wu
 * Dependencies: components/shell.tsx, server/pages.ts
 * Usage:
 */
import { Shell } from '@/components/shell';
import { pageContext } from '@/server/pages';
export const dynamic = 'force-dynamic';
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const context = await pageContext();
  return <Shell context={context}>{children}</Shell>;
}
