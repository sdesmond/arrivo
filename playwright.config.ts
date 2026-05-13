import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'
import dotenv from 'dotenv'

dotenv.config()

const testDir = defineBddConfig({
  features: 'tests/e2e/features/**/*.feature',
  steps: 'tests/e2e/steps/**/*.ts',
})

export default defineConfig({
  testDir,
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/, testDir: 'tests/e2e' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
})
