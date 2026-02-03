import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load environment variables for tests
dotenv.config();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://matter:matter@localhost:5432/matter_db',
      NODE_ENV: 'test',
      PORT: '3000',
      SLA_THRESHOLD_HOURS: '8',
      LOG_LEVEL: 'error',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
    },
  },
});

