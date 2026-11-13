/**
 * Description:  Creates .env.local for the local Supabase stack with generated secrets. Never
 *               overwrites an existing file.
 * Author:       Alex Wu
 * Dependencies: node:child_process, node:fs, node:crypto
 * Usage:        node scripts/local-env.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env.local'))
  throw new Error(
    '.env.local already exists. Keep your existing configuration; this helper never overwrites it.',
  );
const raw = execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['supabase', 'status', '-o', 'json'],
  { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] },
);
const status = JSON.parse(raw);
if (!status.API_URL?.startsWith('http://127.0.0.1:'))
  throw new Error('Expected the isolated local Supabase stack.');
const vars = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  APP_URL: 'http://localhost:3000',
  INSTANCE_SETUP_SECRET: randomBytes(32).toString('hex'),
  CRON_SECRET: randomBytes(32).toString('hex'),
};
writeFileSync(
  '.env.local',
  Object.entries(vars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
  { flag: 'wx' },
);
console.log(
  'Created ignored .env.local for local Supabase. Setup and cron secrets were generated without printing them.',
);
