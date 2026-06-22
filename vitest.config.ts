import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Use the automatic JSX runtime so `.tsx` modules (e.g. the SSR invitation
  // page) transform without an explicit `React` import, matching Next.js.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
});
