import { beforeAll, afterAll } from 'vitest';

Object.assign(process.env, { NODE_ENV: 'test' });

beforeAll(async () => {
  const { resetConnection } = await import('@src/lib/db');
  resetConnection();
  const { runMigrations } = await import('@src/lib/db/migrate');
  await runMigrations();
});

afterAll(async () => {
  try {
    const { closeConnection } = await import('@src/lib/db');
    await closeConnection();
  } catch {}
});
