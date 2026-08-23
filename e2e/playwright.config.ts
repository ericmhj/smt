import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Flows are sequential by nature
  retries: 1,
  workers: 1, // Serial execution for E2E flows
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://sgr-frontend:3000',
    storageState: './tests/.auth/session.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    // Reroute API calls from localhost:3001 to sgr-backend:3001
    // (frontend is built with NEXT_PUBLIC_API_URL=http://localhost:3001
    //  but inside Docker, localhost is the e2e container, not the backend)
    extraHTTPHeaders: {},
  },
  projects: [
    {
      name: 'setup',
      testMatch: 'auth.setup.ts',
      use: { storageState: undefined },
    },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
});
