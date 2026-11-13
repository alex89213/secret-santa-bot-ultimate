/**
 * Description:  Vitest settings for the unit tests.
 * Author:       Alex Wu
 * Dependencies: vitest, node:path, node:url
 * Usage:        npm test
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  resolve: {
    alias: { '@': resolve(root, 'src'), 'server-only': resolve(root, 'tests/server-only.ts') },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
