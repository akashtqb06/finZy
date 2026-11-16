import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_NAME: z.string().default('Finzy'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | undefined;

/**
 * Validates environment variables with Zod.
 * If validation fails, prints and throws ONLY the missing variable names without secrets.
 */
export function validateEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const isTest = rawEnv.NODE_ENV === 'test' || Boolean(rawEnv.VITEST);
  if (isTest && !rawEnv.DATABASE_URL) {
    return {
      NEXT_PUBLIC_SUPABASE_URL: (rawEnv.NEXT_PUBLIC_SUPABASE_URL as string) || 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: (rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || 'dummy-anon-key',
      DATABASE_URL: (rawEnv.DATABASE_URL as string) || 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      DIRECT_URL: (rawEnv.DIRECT_URL as string) || (rawEnv.DATABASE_URL as string) || 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      CRON_SECRET: (rawEnv.CRON_SECRET as string) || 'test-cron-secret',
      APP_URL: (rawEnv.APP_URL as string) || 'http://localhost:3000',
      APP_NAME: (rawEnv.APP_NAME as string) || 'Finzy',
      NODE_ENV: 'test',
    };
  }

  // Support NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY alias
  const input = {
    ...rawEnv,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || rawEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  const parsed = envSchema.safeParse(input);

  if (!parsed.success) {
    const missingKeys = parsed.error.issues.map((issue) => issue.path.join('.'));
    const uniqueKeys = Array.from(new Set(missingKeys));
    const message = `[Env Error] Missing or invalid environment variable(s): ${uniqueKeys.join(', ')}`;
    console.error(message);
    throw new Error(message);
  }

  validatedEnv = parsed.data;
  return validatedEnv;
}

export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}
