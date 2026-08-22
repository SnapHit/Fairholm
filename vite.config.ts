import { defineConfig } from 'vite'

// Build output goes to /dist for Cloudflare Pages. Vite strips types via esbuild and never
// type-checks, so a type error can never block the build. Checking is `npm run typecheck`.
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
