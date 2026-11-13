/**
 * Description:  Checks the built browser files for server secrets and privileged database code.
 * Author:       Alex Wu
 * Dependencies: node:fs, node:path
 * Usage:        node scripts/verify-client-privacy.mjs (after npm run build)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
try {
  process.loadEnvFile('.env.local');
} catch {
  // ci builds may not have a .env.local
}
const secrets = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'DISCORD_BOT_TOKEN',
  'INSTANCE_SETUP_SECRET',
  'CRON_SECRET',
]
  .map((name) => process.env[name])
  .filter(Boolean);
let count = 0;
function visit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) {
      visit(file);
      continue;
    }
    const content = readFileSync(file, 'utf8');
    count++;
    if (secrets.some((secret) => content.includes(secret)))
      throw new Error('A server credential was found in a public build asset.');
    if (
      content.includes('ssbu_claim_delivery') ||
      content.includes('ssbu_finish_delivery') ||
      content.includes('SUPABASE_SERVICE_ROLE_KEY')
    )
      throw new Error('A privileged server module was found in a public build asset.');
  }
}
visit('.next/static');
console.log(
  `Checked ${count} public build assets: no configured secrets or privileged database modules.`,
);
