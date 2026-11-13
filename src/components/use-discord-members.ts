/**
 * Description:  React hook that loads Discord server members and refreshes them every 30 seconds
 *               while the page is visible.
 * Author:       Alex Wu
 * Dependencies: react, components/api.ts
 * Usage:
 */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
export type DiscordPick = { discord_id: string; display_name: string };
type Page = { members: DiscordPick[]; next: string | null };
export function useDiscordMembers(groupId: string, query: string) {
  const [page, setPage] = useState<Page>({ members: [], next: null }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [updated, setUpdated] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null),
    sequence = useRef(0),
    pages = useRef(1),
    cooldown = useRef(0);
  const load = useCallback(
    async (after?: string, automatic = false) => {
      if (Date.now() < cooldown.current || (automatic && request.current)) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const version = ++sequence.current;
      setBusy(true);
      setError('');
      try {
        let cursor = after;
        const found: DiscordPick[] = [];
        let next: string | null = null;
        // refresh every page already browsed so later pages don't disappear on each poll
        const limit = after ? 1 : pages.current;
        for (let i = 0; i < limit; i++) {
          const result = await api<Page>(
            'discord_members',
            { group_id: groupId, query: query.trim(), ...(cursor ? { after: cursor } : {}) },
            controller.signal,
          );
          found.push(...result.members);
          next = result.next;
          if (!next) break;
          cursor = next;
        }
        if (version !== sequence.current || controller.signal.aborted) return;
        if (after) pages.current++;
        setPage((previous) => ({
          members: [
            ...new Map(
              [...(after ? previous.members : []), ...found].map((m) => [m.discord_id, m]),
            ).values(),
          ],
          next,
        }));
        setUpdated(Date.now());
      } catch (e) {
        if (controller.signal.aborted || version !== sequence.current) return;
        if (e instanceof ApiError && e.status === 429)
          cooldown.current = Date.now() + Math.max(e.retryAfter, 1) * 1000;
        setError(e instanceof Error ? e.message : 'Could not refresh Discord members.');
      } finally {
        if (version === sequence.current) {
          request.current = null;
          setBusy(false);
        }
      }
    },
    [groupId, query],
  );
  useEffect(() => {
    pages.current = 1;
    const initial = setTimeout(() => void load(), query.trim() ? 300 : 0);
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void load(undefined, true);
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      request.current?.abort();
      request.current = null;
    };
  }, [load, query]);
  return {
    ...page,
    busy,
    error,
    updated,
    refresh: () => load(),
    loadMore: () => (page.next ? load(page.next) : Promise.resolve()),
  };
}
