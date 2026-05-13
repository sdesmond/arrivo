import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    passWithNoTests: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.mts'],
    coverage: {
      provider: 'v8',
      // thresholds re-enabled once component tests are added in later phases
      // thresholds: { lines: 95, functions: 95, branches: 90 },
      include: ['src/lib/**', 'src/components/**'],
      exclude: [
        'src/lib/auth-helpers.ts',
        'src/lib/queries.ts',
        'src/lib/server-now.ts',
        'src/app/**',
        'src/components/ui/**',
      ],
    },
  },
})
