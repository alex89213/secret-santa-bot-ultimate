/**
 * Description:  Wishlist page where people edit and reorder their own wishlist.
 * Author:       Alex Wu
 * Dependencies: server/pages.ts, domain/types.ts, components/ui.tsx, components/wishlist-editor.tsx
 * Usage:
 */
import { pageContext, resource } from '@/server/pages';
import type { WishlistItem } from '@/domain/types';
import { PageHeading, Empty } from '@/components/ui';
import { WishlistEditor } from '@/components/wishlist-editor';
export default async function Wishlist() {
  const ctx = await pageContext();
  if (!ctx.owner && !ctx.groups.length)
    return (
      <>
        <PageHeading title="My wishlist" />
        <Empty title="Not available yet">
          Your wishlist opens once a server admin adds your Discord account.
        </Empty>
      </>
    );
  const items = await resource<WishlistItem[]>('wishlist');
  return (
    <>
      <PageHeading
        title="My wishlist"
        meta="Most wanted first. Only you and whoever draws your name can see it."
      />
      <WishlistEditor initial={items} />
    </>
  );
}
