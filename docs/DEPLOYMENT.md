# GUTECH deployment

The supported no-card setup is two Vercel projects (React frontend and Express API) backed by the existing Supabase project. The repository is `https://github.com/hassannrizwann/gutech-lms-portal`.

## 1. Apply the Supabase schema

In the Supabase SQL Editor for the GUTECH project, confirm which migrations have already been applied. Apply any missing files from `supabase/migrations/` in numeric order. Apply `0004_attendance.sql` if the attendance table is missing. Do not rerun a migration that already created its objects; migrations are not generally safe to apply twice.

Keep the service role key private. It belongs only in the API project's protected environment variables; the browser receives the anon/public key.

## 2. Deploy the API project

In Vercel, import the repository as a new project named `gutech-lms-api` and set **Root Directory** to `backend`. Vercel detects the Express entry point at `backend/index.ts`.

Set these Production environment variables in the API project's Settings before using the API:

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role/secret key
- `CLIENT_ORIGIN`: exact frontend Vercel origin, without a trailing slash
- `PASSWORD_RESET_REDIRECT`: frontend URL plus `/reset-password`

Never commit or share the service-role key. Enter it directly in Vercel's protected environment-variable settings.

## 3. Deploy the frontend project

Import the same repository as a second Vercel project named `gutech-lms-portal` and set **Root Directory** to `frontend`. `frontend/vercel.json` builds the Vite app and serves its SPA routes.

Set these Production environment variables before deployment:

- `VITE_API_URL`: API project URL plus `/api`
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon/public key

After the frontend deployment succeeds, set `CLIENT_ORIGIN` and `PASSWORD_RESET_REDIRECT` on the API project to the exact frontend URL and redeploy the API.

## 4. Configure Supabase Auth and verify

Add the frontend URL as the Supabase Auth site URL and add its `/reset-password` URL to the redirect allowlist. Open `/login`, sign in with an existing account, and verify role-based pages and read/write flows. Verify attendance after applying its migration.

Only `.env.example` files belong in source control. Local `.env` values should be entered directly into the corresponding provider's private environment settings.
