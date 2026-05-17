# Content Network OS

A private internal dashboard for managing AI-assisted content production across a network of blog and niche sites. Takes keywords → generates AI briefs → generates AI drafts → review pipeline → publishes to external CMS sites via REST API.

## Quick start

1. Clone this repo
2. `cp .env.example .env.local`
3. Fill in the required environment variables (see table below)
4. `npm install`
5. `npm run db:push` — creates tables in your Neon database
6. `npm run dev` — open http://localhost:3000

## Architecture

- **Next.js 15** App Router — single deployment, server components by default
- **Neon Postgres + Drizzle ORM** — all application state
- **Inngest** — background jobs for AI generation and scheduled publishing
- **Better-Auth** — email/password authentication, single-user mode
- **Vercel AI SDK + OpenAI** — draft and brief generation
- **Tiptap** — WYSIWYG draft editor
- **CMS API** — communicates with external CMSs via Bearer-token REST API (see SPEC.md §6)

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | Yes | Random secret — `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Yes | App URL e.g. `http://localhost:3000` |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Yes | Same as above (client-side) |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 key — `openssl rand -base64 32` |
| `OPENAI_API_KEY` | For generation | OpenAI API key |
| `PEXELS_API_KEY` | For images | Pexels API key |
| `INNGEST_EVENT_KEY` | For background jobs | From Inngest dashboard |
| `INNGEST_SIGNING_KEY` | For background jobs | From Inngest dashboard |

## Adding a target CMS

1. Go to **Sites** → **Add site**
2. Enter the site name, hostname, and API base URL (usually `https://{hostname}/api/public/v1`)
3. Enter the Bearer token API key
4. Click **Test connection** to verify
5. Set default category and tone (optional)

The target CMS must implement the API contract in `SPEC.md` §6.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
| `npx playwright test` | Run E2E tests |

## Tests

End-to-end tests use Playwright and live in `e2e/`. They test:
- Auth redirect guards (all protected routes redirect to `/login` when unauthenticated)
- Login page structure
- Invalid credential error display

Run with `npx playwright test`. Tests are also run in CI on every push via GitHub Actions.
