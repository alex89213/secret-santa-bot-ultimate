/**
 * Description:  Starts the standalone production server after copying its static files next to it.
 * Author:       Alex Wu
 * Dependencies: node:fs, node:child_process
 * Usage:        npm start
 */
import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
if (!existsSync('.next/standalone/server.js'))
  throw new Error('Run npm run build before starting.');
try {
  process.loadEnvFile('.env.local');
} catch {
  // production hosts set the variables themselves
}
cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: '0.0.0.0' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
