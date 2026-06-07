import { defineConfig } from 'vitest/config';

export default defineConfig({
  include: ['__tests__/**/*.test.ts'],
  environment: 'node',
  globals: true,
});
