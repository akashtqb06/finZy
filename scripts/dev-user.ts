import { execSync } from 'node:child_process';
import { ensureProfile } from '../src/lib/finance/profile';

interface SupabaseStatus {
  API_URL?: string;
  apiUrl?: string;
  SERVICE_ROLE_KEY?: string;
  serviceRoleKey?: string;
}

interface AuthAdminUser {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
}

function getSupabaseConfig(): { apiUrl: string; serviceKey: string } {
  try {
    const output = execSync('pnpm supabase status -o json', {
      encoding: 'utf-8',
      env: { ...process.env, DO_NOT_TRACK: '1', SUPABASE_TELEMETRY: 'false' },
    });
    const parsed = JSON.parse(output) as SupabaseStatus;
    const apiUrl = parsed.API_URL || parsed.apiUrl;
    const serviceKey = parsed.SERVICE_ROLE_KEY || parsed.serviceRoleKey;
    if (apiUrl && serviceKey) {
      return { apiUrl, serviceKey };
    }
  } catch {
    // Fall back to plain text parse
  }

  try {
    const textOutput = execSync('pnpm supabase status', {
      encoding: 'utf-8',
      env: { ...process.env, DO_NOT_TRACK: '1', SUPABASE_TELEMETRY: 'false' },
    });
    const apiUrlMatch = textOutput.match(/API URL:\s*(https?:\/\/[^\s]+)/i);
    const serviceKeyMatch = textOutput.match(/service_role key:\s*([^\s]+)/i);
    if (apiUrlMatch && serviceKeyMatch) {
      return { apiUrl: apiUrlMatch[1].trim(), serviceKey: serviceKeyMatch[1].trim() };
    }
  } catch (_err) {
    throw new Error('Supabase local stack is not running. Start it with `pnpm db:start`.');
  }

  throw new Error('Could not parse API URL and service key from `supabase status`.');
}

async function createOrUpdateDevUser(): Promise<void> {
  const { apiUrl, serviceKey } = getSupabaseConfig();
  const email = process.env.DEV_USER_EMAIL || 'dev@finzy.local';
  const password = process.env.DEV_USER_PASSWORD || 'password123';

  // 1. Try to create user via Admin API
  const createRes = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: 'Dev User',
        full_name: 'Dev User',
      },
    }),
  });

  let authUser: AuthAdminUser;

  if (createRes.ok) {
    authUser = (await createRes.json()) as AuthAdminUser;
  } else {
    // If user already exists, find user id and update password
    const listRes = await fetch(`${apiUrl}/auth/v1/admin/users`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });

    if (!listRes.ok) {
      throw new Error(`Failed to list users from Supabase Admin API: ${listRes.statusText}`);
    }

    const { users } = (await listRes.json()) as { users: AuthAdminUser[] };
    const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!existing) {
      const errText = await createRes.text();
      throw new Error(`Failed to create dev user: ${errText}`);
    }

    // Update existing user password
    const updateRes = await fetch(`${apiUrl}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password,
        email_confirm: true,
      }),
    });

    if (!updateRes.ok) {
      throw new Error(`Failed to update existing dev user: ${updateRes.statusText}`);
    }

    authUser = existing;
  }

  // 2. Ensure profile & default categories in DB
  await ensureProfile({
    id: authUser.id,
    email: authUser.email,
    user_metadata: authUser.user_metadata,
  });

  console.log(`✅ Dev user successfully configured:`);
  console.log(`   ID:       ${authUser.id}`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
}

createOrUpdateDevUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error creating dev user:', err.message);
    process.exit(1);
  });
