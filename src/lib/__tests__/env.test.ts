import { describe, it, expect } from 'vitest';
import { validateEnv } from '../env';

describe('Environment Validation', () => {
  it('successfully validates a complete environment configuration', () => {
    const rawEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-abc123xyz',
      DATABASE_URL: 'postgres://postgres:secret@db.example.com:6543/postgres',
      CRON_SECRET: 'super-secret-cron-token',
      APP_URL: 'https://app.finzy.com',
      APP_NAME: 'FinZy Custom',
      NODE_ENV: 'production',
    };

    const env = validateEnv(rawEnv);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key-abc123xyz');
    expect(env.DATABASE_URL).toBe('postgres://postgres:secret@db.example.com:6543/postgres');
    expect(env.APP_NAME).toBe('FinZy Custom');
  });

  it('prints and throws ONLY missing variable names and never leaks secrets', () => {
    const partialEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      DATABASE_URL: 'postgres://postgres:secret_password_here@db.example.com:6543/postgres',
      NODE_ENV: 'production',
    };

    expect(() => validateEnv(partialEnv)).toThrowError(
      '[Env Error] Missing or invalid environment variable(s): NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );

    // Verify secret password was NOT leaked in the error message
    try {
      validateEnv(partialEnv);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain('secret_password_here');
      expect(msg).not.toContain('postgres://');
    }
  });

  it('accepts NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as an alias for anon key', () => {
    const rawEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key-alias',
      DATABASE_URL: 'postgres://postgres:secret@db.example.com:6543/postgres',
      NODE_ENV: 'production',
    };

    const env = validateEnv(rawEnv);
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('publishable-key-alias');
  });

  it('defaults APP_NAME to FinZy when not specified', () => {
    const rawEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-abc123xyz',
      DATABASE_URL: 'postgres://postgres:secret@db.example.com:6543/postgres',
      NODE_ENV: 'production',
    };

    const env = validateEnv(rawEnv);
    expect(env.APP_NAME).toBe('FinZy');
  });
});
