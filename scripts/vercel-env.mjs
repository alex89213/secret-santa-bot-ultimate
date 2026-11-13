/**
 * Description:  Checks the production settings in a file and sends them to the linked Vercel project.
 *               Values go to Vercel through stdin, so they never show up in the terminal or shell
 *               history. Creates the file with generated secrets on the first run.
 * Author:       Alex Wu
 * Dependencies: node:child_process, node:crypto, node:fs, node:url, Vercel CLI (through npx)
 * Usage:        npm run vercel:env -- [file] [--dry-run]   (file defaults to .env.production.local)
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SECRET = 'secret',
  CONFIG = 'config';

/** Settings sent to Vercel, in order, with how each one is stored and checked. */
export const SETTINGS = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    type: CONFIG,
    hint: 'Supabase project URL, like https://YOUR-REF.supabase.co',
    check: (v) => (/^https:\/\/[^/\s]+$/.test(v) ? null : 'must be an https address with no path'),
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    type: CONFIG,
    hint: 'Supabase publishable key (sb_publishable_...)',
    check: (v) =>
      v.startsWith('sb_secret_') ? 'this is the secret key, not the publishable key' : null,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    type: SECRET,
    hint: 'Supabase secret key (sb_secret_...)',
    check: (v) =>
      v.startsWith('sb_publishable_') ? 'this is the publishable key, not the secret key' : null,
  },
  {
    name: 'DISCORD_BOT_TOKEN',
    type: SECRET,
    hint: 'Discord bot token from the Bot page',
    check: (v) => (v.split('.').length === 3 ? null : "doesn't look like a Discord bot token"),
  },
  {
    name: 'INSTANCE_SETUP_SECRET',
    type: SECRET,
    generate: true,
    hint: 'entered once at /setup to become the owner',
    check: (v) => (v.length >= 32 ? null : 'must be at least 32 characters'),
  },
  {
    name: 'CRON_SECRET',
    type: SECRET,
    generate: true,
    hint: 'protects scheduled sending',
    check: (v) => (v.length >= 32 ? null : 'must be at least 32 characters'),
  },
  {
    name: 'APP_URL',
    type: CONFIG,
    optional: true,
    hint: 'only for a custom domain, Vercel finds its own address otherwise',
    check: (v) =>
      /^https:\/\/[^/\s]+$/.test(v)
        ? null
        : 'must be an https address with no path or trailing slash',
  },
];

/** Reads KEY=VALUE lines, skipping comments and blank lines and removing surrounding quotes. */
export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const key = line.slice(0, line.indexOf('=')).trim();
    values[key] = line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/**
 * Checks every setting and returns the ones to send plus any problems.
 * A blank optional setting, or an APP_URL pointing at localhost, is skipped instead of sent.
 */
export function checkEnv(values) {
  const send = [],
    problems = [],
    skipped = [];
  for (const setting of SETTINGS) {
    const value = values[setting.name] ?? '';
    if (setting.optional && (!value || /\/\/(localhost|127\.0\.0\.1)\b/.test(value))) {
      skipped.push(setting.name);
      continue;
    }
    if (!value) {
      problems.push(`${setting.name} is empty (${setting.hint})`);
      continue;
    }
    const problem = setting.check(value);
    if (problem) problems.push(`${setting.name} ${problem}`);
    else send.push({ ...setting, value });
  }
  return { send, problems, skipped };
}

/** Writes a starting file with every setting listed and the two secrets already generated. */
function createTemplate(file) {
  const lines = ['# Production settings for npm run vercel:env. Never commit this file.', ''];
  for (const s of SETTINGS) {
    lines.push(`# ${s.hint}`);
    lines.push(`${s.name}=${s.generate ? randomBytes(32).toString('hex') : ''}`);
  }
  writeFileSync(file, lines.join('\n') + '\n', { flag: 'wx' });
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--')) ?? '.env.production.local';
  if (!existsSync(file)) {
    createTemplate(file);
    console.log(`Created ${file} with the two secrets already generated.`);
    console.log('Fill in the other values, then run this command again.');
    return;
  }
  const { send, problems, skipped } = checkEnv(parseEnv(readFileSync(file, 'utf8')));
  if (problems.length) {
    console.error(`Nothing was sent. Fix these in ${file}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  for (const name of skipped) console.log(`Skipping ${name} (blank or localhost).`);
  for (const s of send) {
    if (dryRun) {
      console.log(`Would send ${s.name} as ${s.type}.`);
      continue;
    }
    // send the value through stdin so it never appears in the command line
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['vercel', 'env', 'add', s.name, 'production', '--type', s.type, '--force', '--yes'],
      { input: s.value, encoding: 'utf8', shell: process.platform === 'win32' },
    );
    if (result.status !== 0) {
      console.error(`Couldn't send ${s.name}. Run npx vercel link first, then try again.`);
      process.exit(1);
    }
    console.log(`Sent ${s.name}.`);
  }
  if (!dryRun) {
    console.log('Done. Deploy with npx vercel deploy --prod for the settings to take effect.');
    console.log(`Your setup secret for /setup is INSTANCE_SETUP_SECRET in ${file}.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
