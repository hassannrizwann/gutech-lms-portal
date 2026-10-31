# GUTECH Learning Management System

A responsive learning portal for Ghazali University School of Technology built with React, TypeScript, Express and Supabase.

Source repository: [github.com/hassannrizwann/gutech-lms-portal](https://github.com/hassannrizwann/gutech-lms-portal).

## Local setup

1. Install Node.js 20 or newer and the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Run `npm install` from the repository root.
3. Copy `backend/.env.example` to `backend/.env` and add the local Supabase URL, anon key and service role key.
4. Copy `frontend/.env.example` to `frontend/.env.local` and add the local URL and anon key.
5. Start local Supabase with `npx supabase start`.
6. Apply the schema and sample data with `npx supabase db reset`.
7. Start the API and web app with `npm run dev`.
8. Open `http://localhost:5173` and sign in using one of the local accounts below.

Sample accounts are created only by the local development seed. Use those credentials only with a local Supabase instance; do not reuse them in production. Real LMS accounts and the private credentials workbook are intentionally excluded from source control.

## Commands

- `npm run dev` — start the API and frontend.
- `npm run build` — type-check and build both workspaces.
- `npm run test` — run workspace tests.
- `npm run db:reset` — reset local Supabase, apply migrations and load seed data.

## Architecture

`frontend/` is the React SPA. All application data uses the Express API; Supabase is exposed to the browser only for authenticated Realtime subscriptions. `backend/` owns validation, auth, authorization, and the server-only service role key. `supabase/migrations/` contains ordered SQL migrations with RLS enabled on every application table.

Only `.env.example` files belong in source control. Never put the Supabase service role key in the frontend environment.

## Production deployment

The project can be deployed as two Vercel projects: the Express API with root directory `backend`, then the React frontend with root directory `frontend`. Set the API's Supabase variables and service-role key in its protected environment settings. Set `VITE_API_URL` in the frontend project to the API URL plus `/api`, then set the API's `CLIENT_ORIGIN` and password-reset redirect to the frontend URL. `render.yaml` is also provided as an alternative API deployment Blueprint. Set the Supabase Auth site URL and password-reset redirect allowlist to the deployed frontend domain.

Before going live, apply the migrations in `supabase/migrations/` to the hosted Supabase project. In particular, apply `0004_attendance.sql` to enable persistent attendance. Do not deploy until the Supabase URL and required environment keys are valid and set on both services. See the local `.env.example` files for each service's variable names.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the ordered setup and [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) for a short presentation script.
