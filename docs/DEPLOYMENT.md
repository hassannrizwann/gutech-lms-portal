# GUTECH deployment

This project deploys as a Vercel static frontend, a Render Node API, and the existing Supabase project.

## 1. Push the source to a public GitHub repository

Create a repository named `gutech-lms-portal` and push this folder's source. Confirm `.env`, `.env.local`, `outputs/`, and the credentials workbook are ignored before the first push. The local seed uses `@demo.invalid` accounts and is for local reset only.

## 2. Apply the Supabase schema

In the Supabase SQL Editor for the GUTECH project, confirm which migrations have already been applied. Apply any missing files from `supabase/migrations/` in numeric order. Apply `0004_attendance.sql` if the attendance table is missing. Do not rerun a migration that already created its objects; migrations are not generally safe to apply twice.

Keep the service role key private. It is only for the Render API environment; the browser receives the anon key.

## 3. Deploy the API to Render

Create a Blueprint from the GitHub repository and use `render.yaml`. Set these values on the Render service:

- `SUPABASE_URL`: project URL
- `SUPABASE_ANON_KEY`: project anon/public key
- `SUPABASE_SERVICE_ROLE_KEY`: project service-role/secret key
- `CLIENT_ORIGIN`: exact Vercel site origin, without a trailing slash
- `PASSWORD_RESET_REDIRECT`: the Vercel site URL plus `/reset-password`

Wait for Render's `/health` check to pass and copy the API origin, for example `https://gutech-lms-api.onrender.com`.

## 4. Deploy the frontend to Vercel

Import the same repository. Keep the project root at the repository root; `vercel.json` builds `frontend` and serves its `dist` output. Set these Vercel environment variables for Production (and Preview if needed):

- `VITE_API_URL`: Render API origin plus `/api`
- `VITE_SUPABASE_URL`: project URL
- `VITE_SUPABASE_ANON_KEY`: project anon/public key

Deploy, copy the Vercel URL, then update Render's `CLIENT_ORIGIN` and `PASSWORD_RESET_REDIRECT` with that exact URL and redeploy the API. Add the Vercel URL and its `/reset-password` path to Supabase Auth's site URL and redirect URL allowlist.

## 5. Verify

Open `/login`, sign in with an existing account, and check role-based pages and read/write flows. Verify attendance after applying its migration. Render's free service can sleep when idle, so the first request after inactivity may take longer.

The values in local `.env` files should be entered by the project owner into each provider's private environment-variable settings. Never commit or paste the service-role key into Vercel or frontend code.
