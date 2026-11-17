/**
 * Description:  Small Discord REST client for reading server members and sending DMs.
 * Author:       Alex Wu
 * Dependencies: server-only, server/env.ts
 * Usage:
 */
import 'server-only';
import { env } from './env';
export class DiscordError extends Error {
  constructor(
    public status: number,
    public retryAfter = 0,
    public uncertain = false,
  ) {
    super(
      status === 403
        ? 'Discord denied access. Check bot installation, member intent, or the recipient’s DM settings.'
        : status === 429
          ? 'Discord rate limit reached. Try again after the cooldown.'
          : 'Discord could not complete the request.',
    );
  }
}
export type DiscordMember = {
  user: { id: string; username: string; global_name?: string | null; bot?: boolean };
  nick?: string | null;
};
/** Gets the name Discord shows in a server: the nickname, then the display name, then the username. */
export function memberName(member: DiscordMember): string {
  return (member.nick || member.user.global_name || member.user.username).slice(0, 100);
}
export class DiscordRest {
  constructor(
    private token = env('DISCORD_BOT_TOKEN'),
    private transport: typeof fetch = fetch,
  ) {}
  /**
   * Sends a request to the Discord API. Set `idempotent` for a POST that is safe to repeat, such as
   * opening a DM channel, so a lost response isn't reported as a possibly sent message.
   */
  async request<T>(path: string, init: RequestInit = {}, idempotent = false): Promise<T> {
    const unsafe = init.method === 'POST' && !idempotent;
    let response: Response;
    try {
      response = await this.transport(`https://discord.com/api/v10${path}`, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SecretSantaBotUltimate (https://github.com, 1.0)',
          ...init.headers,
        },
      });
    } catch {
      throw new DiscordError(0, 0, unsafe);
    }
    if (!response.ok) {
      let retry = 0;
      if (response.status === 429) {
        const data = await response.json().catch(() => ({ retry_after: 1 }));
        retry = Math.max(
          1,
          Math.ceil(Number(data.retry_after) || Number(response.headers.get('retry-after')) || 1),
        );
      }
      throw new DiscordError(response.status, retry, unsafe && response.status >= 500);
    }
    return (await response.json()) as T;
  }
  /** Gets the bot's own application, whose id is the client id in the bot invite link. */
  application() {
    return this.request<{ id: string; name: string }>('/applications/@me');
  }
  /** Lists the servers the bot is in, up to 200, which is plenty for a self-hosted site. */
  guilds() {
    return this.request<{ id: string; name: string }[]>('/users/@me/guilds?limit=200');
  }
  guild(id: string) {
    return this.request<{ id: string; name: string }>(`/guilds/${id}`);
  }
  member(guild: string, id: string) {
    return this.request<DiscordMember>(`/guilds/${guild}/members/${id}`);
  }
  async members(guild: string, query = '', after?: string) {
    const params = new URLSearchParams({ limit: '100' });
    if (query) params.set('query', query);
    else if (after) params.set('after', after);
    const raw = await this.request<DiscordMember[]>(
      `/guilds/${guild}/members${query ? '/search' : ''}?${params}`,
    );
    return {
      members: raw
        .filter((m) => !m.user.bot)
        .map((m) => ({
          discord_id: m.user.id,
          display_name: memberName(m),
        })),
      next: !query && raw.length === 100 ? raw.at(-1)!.user.id : null,
    };
  }
  channel(recipientId: string) {
    return this.request<{ id: string }>(
      '/users/@me/channels',
      { method: 'POST', body: JSON.stringify({ recipient_id: recipientId }) },
      true,
    );
  }
  message(channelId: string, content: string, nonce: string) {
    return this.request<{ id: string }>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
        nonce,
        enforce_nonce: true,
      }),
    });
  }
}
