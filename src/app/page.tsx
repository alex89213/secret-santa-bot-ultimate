/**
 * Description:  Sends visitors from / to the Home page, and finishes sign-in codes that land here.
 * Author:       Alex Wu
 * Dependencies: next
 * Usage:
 */
import { redirect } from 'next/navigation';
export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  // supabase sends a sign-in code here when it doesn't recognize the return address
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  redirect('/dashboard');
}
