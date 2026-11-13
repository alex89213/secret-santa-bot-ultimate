/**
 * Description:  ESLint settings for the Next.js and TypeScript code.
 * Author:       Alex Wu
 * Dependencies: eslint, eslint-config-next
 * Usage:        npm run lint
 */
import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    '.next/**',
    '.next-e2e/**',
    'output/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
