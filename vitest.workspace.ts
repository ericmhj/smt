import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'shared',
      include: ['packages/shared/**/*.{test,spec}.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'backend',
      include: ['packages/backend/**/*.{test,spec}.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'frontend',
      environment: 'jsdom',
      include: ['packages/frontend/**/*.{test,spec}.{ts,tsx}'],
    },
  },
]);
