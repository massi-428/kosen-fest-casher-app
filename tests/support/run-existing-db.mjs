import env from '@next/env';
env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
process.env.RUN_DB_TESTS = '1';
await import('../db-integration.test.mjs');
