# Production Cutover Runbook: Legacy Container to Supabase Live

This runbook defines the exact, sequential procedure for cutting over personal finance data from the legacy production container to the Supabase PostgreSQL live schema.

---

## Prerequisites & Pre-Flight Checks

Before beginning the cutover window:
- Verify that `pnpm tsc --noEmit`, `pnpm lint`, and `pnpm test` all pass cleanly on the `finzy` branch.
- Have your Supabase project credentials ready:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `DIRECT_URL` (Direct database connection string, port 5432 or session pooler)
  - `SOURCE_DATABASE_URL` (Connection string to the legacy container database)

---

## Step-by-Step Cutover Sequence

### 1. Final Backup of the Legacy Container
Take a final, authoritative snapshot of the legacy production container database before stopping writes:

```bash
# Navigate to the deployment folder / container directory
docker exec -t bikit-db pg_dump -U postgres -Fc -d bikit_prod > ./backups/legacy-final-$(date +%Y%m%d-%H%M%S).dump

# Verify that the dump file is valid and readable
pg_restore --list ./backups/legacy-final-*.dump | head -n 20
```

### 2. Stop the Legacy Application Container
Freeze all write traffic by stopping the legacy app service (preventing any split-brain transactions):

```bash
docker stop bikit-app
# Verify the web app is no longer taking requests
curl -I http://localhost:3000 || echo "Legacy app is offline."
```

### 3. Migrate the Target Database Schema
Apply the Drizzle migrations to the target database and confirm all Row Level Security (RLS) policies are active:

```bash
# Migrate target database (requires typing the remote hostname to confirm)
DIRECT_URL="postgres://postgres:[PASSWORD]@[HOST]:5432/postgres" pnpm db:migrate --target live

# Verify that every public table has Row-Level Security enabled
DIRECT_URL="postgres://postgres:[PASSWORD]@[HOST]:5432/postgres" pnpm db:check-rls
```

### 4. Create the Supabase Auth User
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication > Users > Add user > Create user**.
3. Enter your primary email and a secure password.
4. Copy the generated **User UID** (UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

### 5. Rehearsal ETL Run (Against Local Copy)
Before writing to live Supabase, rehearse against the local Supabase stack or a scratch copy:

```bash
# Ensure local Supabase stack is running
pnpm db:status || pnpm db:start

# Run dry-run rehearsal against local target
SOURCE_DATABASE_URL="postgres://postgres:password@localhost:5432/bikit_prod" \
DIRECT_URL="postgres://postgres:postgres@127.0.0.1:54322/postgres" \
pnpm db:migrate:legacy \
  --user-map "myemail@domain.com=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  --dry-run
```
*Verify that the dry-run output reports 100% verification pass and transaction rollback.*

### 6. Execute Live ETL Migration
Run the production migration inside a single target transaction with immediate verification:

```bash
SOURCE_DATABASE_URL="postgres://postgres:[SOURCE_PASS]@[SOURCE_HOST]:5432/bikit_prod" \
DIRECT_URL="postgres://postgres:[TARGET_PASS]@[TARGET_HOST]:5432/postgres" \
pnpm db:migrate:legacy \
  --user-map "myemail@domain.com=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

*Review the summary table output. Confirm:*
- *Migrated user list matches your email.*
- *Skipped tables list shows sessions, login_attempts, passwords, and BI tables.*
- *Table row counts and SHA-256 ID checksums match.*
- *Verification check passes.*

### 7. Run Reconciliation Verification
Execute the finance health verification script against the live database:

```bash
DIRECT_URL="postgres://postgres:[TARGET_PASS]@[TARGET_HOST]:5432/postgres" \
pnpm finance:verify --user "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 8. Deploy the Application
Deploy the new application build to your production hosting environment (e.g. Vercel, Coolify, or VPS):

```bash
git checkout finzy
git push origin finzy
```
*Ensure environment variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `DIRECT_URL` are set on the host.*

### 9. Multi-Device Smoke Test
1. **Desktop**: Open your live app domain in an incognito window, sign in via Supabase Auth, and verify:
   - Account balances on `/finance/accounts`
   - Net worth graph on `/finance/overview`
   - Transaction list on `/finance/transactions`
2. **Mobile**: Sign in from your smartphone browser and verify bottom navigation, quick-add dialog, and responsiveness.

### 10. Reconcile with Bank Balances
Compare the displayed account balances in the app with your actual bank accounts, credit card statements, and investment portfolios:
- Liquid cash & bank balances match current cleared statements.
- Credit card balances reflect current outstanding dues.
- Investment valuations match latest recorded asset prices.

### 11. Decommission & Archival Policy
- Keep the legacy production database container **stopped** (do not delete or destroy).
- Retain the final pre-cutover backup file (`legacy-final-*.dump`) in secure cold storage for at least **30 days**.
- After 30 days of seamless live operation, the old container and volume may be decommissioned.

---

## Rollback Procedure

If unresolvable discrepancies or blockers occur prior to changing DNS / retiring the old service:

1. **Stop the new app** or revert DNS back to the legacy server.
2. **Ensure legacy container is intact**:
   ```bash
   docker start bikit-db
   docker start bikit-app
   ```
3. **If legacy data was altered**, restore the pre-cutover snapshot:
   ```bash
   docker exec -i bikit-db pg_restore -U postgres --clean --if-exists -d bikit_prod < ./backups/legacy-final-*.dump
   ```
4. **Log the discrepancy**:
   Save target error logs and SHA-256 checksum mismatch output for debugging before retrying.
