import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './tests/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'tests/', '*.config.js', 'sw.js'],
      // Coverage thresholds for core files
      thresholds: {
        lines: 70,
        functions: 85,
        branches: 70,
        statements: 70,
      },
      // Report on all files, not just tested ones
      all: true,
      // Include only source files
      include: ['core.js', 'markdown-editor.js'],
    },
  },
});
