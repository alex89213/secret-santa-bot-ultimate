/**
 * Description:  Vitest settings for the database tests.
 * Author:       Alex Wu
 * Dependencies: vitest, vitest.config.ts
 * Usage:        npm run test:db
 */
import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ['tests/db/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
