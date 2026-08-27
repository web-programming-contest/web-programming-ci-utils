import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['grader/tests/**/*.test.mjs'],
    pool: 'forks',
    reporters: ['default'],
    sequence: { concurrent: false },
    testTimeout: 5000,
  },
});
