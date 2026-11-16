import { defineConfig } from 'vitest/config';
export default defineConfig({
  define: { __APP_VERSION__: '"test"', __CHANNEL__: '"stable"', __BUILD_TIME__: '"test"' },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 30000 },
});
