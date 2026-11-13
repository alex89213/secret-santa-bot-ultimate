/**
 * Description:  Tests the checks the vercel:env script runs before sending settings to Vercel.
 * Author:       Alex Wu
 * Dependencies: vitest, scripts/vercel-env.mjs
 * Usage:        npm test
 */
import { expect, it } from 'vitest';
// @ts-expect-error plain JavaScript script without type declarations
import { checkEnv, parseEnv } from '../../scripts/vercel-env.mjs';
const good = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
  DISCORD_BOT_TOKEN: 'aaa.bbb.ccc',
  INSTANCE_SETUP_SECRET: 'x'.repeat(64),
  CRON_SECRET: 'y'.repeat(64),
};
const names = (send: { name: string }[]) => send.map((s) => s.name);
it('reads env files with comments, quotes and Windows line endings', () => {
  expect(parseEnv('# note\r\nA=1\r\nB="two"\r\n\r\nC = three \r\n')).toEqual({
    A: '1',
    B: 'two',
    C: 'three',
  });
});
it('sends every required setting when all are valid', () => {
  const result = checkEnv(good);
  expect(result.problems).toEqual([]);
  expect(names(result.send)).toEqual(Object.keys(good));
});
it('should refuse empty and short secrets before sending anything', () => {
  const { problems } = checkEnv({ ...good, INSTANCE_SETUP_SECRET: 'short', CRON_SECRET: '' });
  expect(problems).toHaveLength(2);
  expect(problems[0]).toContain('at least 32 characters');
  expect(problems[1]).toContain('CRON_SECRET is empty');
});
it('should catch swapped Supabase keys and a bad bot token', () => {
  const { problems } = checkEnv({
    ...good,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_x',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_x',
    DISCORD_BOT_TOKEN: 'not-a-token',
  });
  expect(problems).toHaveLength(3);
});
it('should skip a blank or localhost APP_URL and send a real one', () => {
  expect(checkEnv({ ...good, APP_URL: 'http://localhost:3000' }).skipped).toEqual(['APP_URL']);
  expect(checkEnv(good).skipped).toEqual(['APP_URL']);
  expect(names(checkEnv({ ...good, APP_URL: 'https://santa.example.org' }).send)).toContain(
    'APP_URL',
  );
  expect(checkEnv({ ...good, APP_URL: 'https://santa.example.org/' }).problems).toHaveLength(1);
});
