# AI Factory

**Describe it. Build it. Test it. Launch it.**

AI Factory is a no-code platform where complete beginners create, test and publish their own AI agents. You type what you want in plain English, *The Architect* builds an editable visual workflow, you test it in a chat playground, and you publish it as a shareable chat page.

> **MVP constraint:** this version uses **no hosted AI APIs** (no OpenAI, Claude or Gemini). AI runs locally through [Ollama](https://ollama.com), and The Architect is rule-based. Hosted providers are wired in as adapters that are switched off. See [docs/STATUS.md](docs/STATUS.md) for exactly what works and what doesn't.

![Stack](https://img.shields.io/badge/Next.js_15-FastAPI-7c5cff) ![Tests](https://img.shields.io/badge/backend_tests-53_passing-22c55e) ![E2E](https://img.shields.io/badge/e2e-beginner_flow_passing-22c55e)

## What a beginner can do

The app is designed to be usable by someone who has never used software like this: an 18px base text size, large buttons, light mode, plain words ("steps", "AI brain", "Share") and a **5-step guide** after sign-up (what it should help with → name it → add documents → try it → share it). The visual editor below is still there behind *Advanced: change the steps*.

1. Create an account (built-in email + password).
2. Describe an agent, e.g. *“Create an AI receptionist for my plumbing business that answers customer questions, reads my business documents, and collects booking requests.”*
3. Get a validated visual workflow (Input → Knowledge Search → Prompt → AI Model → Output), with a plain-English explanation and an honest list of anything that can't be built yet.
4. Edit it with drag-and-drop or by chatting with The Architect (“add a condition that sends complicated questions for human review”), review the diff, and accept it. Every change is versioned and undoable.
5. Upload PDFs, TXT or Markdown files the agent answers from, with source references.
6. Test it in a chat playground that runs the real workflow and shows each block, timing, tokens, cost and sources. Errors are explained simply with technical details tucked away.
7. Publish it to `/a/<slug>`, a hosted chat page with its own name, welcome message, avatar and colour.

## Quick start (local, no accounts, no API keys)

Requirements: Python 3.11+, Node 20+, and (for real AI replies) [Ollama](https://ollama.com).

```bash
# 1. Local AI model (one time)
ollama pull llama3.2
ollama pull nomic-embed-text      # optional: meaning-based document search

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head              # creates ai_factory.db (SQLite)
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                        # http://localhost:3000
```

Copy `.env.example` to `.env` (repo root or `backend/`) to change settings. Defaults work out of the box.

**No Ollama?** Everything except AI replies still works. The editor shows a clear “Ollama isn't running” banner and test runs fail with a friendly explanation (never a fake answer). You can switch an AI Model block to **Document Quote Finder (no AI)**, a deterministic responder that quotes your documents and is labelled as not-AI everywhere.

### Docker

```bash
docker compose up --build
docker compose exec ollama ollama pull llama3.2
```

This starts Postgres 16, the API, the web app and Ollama. Open http://localhost:3000.

## Development commands

| What | Command |
|---|---|
| Backend dev server | `cd backend && uvicorn app.main:app --reload` |
| Backend tests (SQLite) | `cd backend && pytest -q` |
| Backend tests (Postgres) | `AIF_TEST_DATABASE_URL=postgresql+psycopg://user@host/db pytest -q` |
| New DB migration | `cd backend && alembic revision --autogenerate -m "..."` |
| Frontend dev server | `cd frontend && npm run dev` |
| Type check | `cd frontend && npm run typecheck` |
| Production build | `cd frontend && npm run build` |
| End-to-end test | see [docs/TESTING.md](docs/TESTING.md) |

## Connecting things

### Local AI (Ollama): the supported provider
Install Ollama, run `ollama pull llama3.2`, and keep it running. Set `AIF_OLLAMA_BASE_URL` if it isn't on `localhost:11434`. Settings → *AI models* shows live status and which models are downloaded. Any Ollama model name works in the AI Model block (“Other model name…”).

### OpenAI / Claude / Gemini / Grok: not enabled in the MVP
Adapters exist in `backend/app/providers/hosted.py` and appear in the UI as “coming later”. The validator refuses to run or publish workflows that use them. To enable one later: implement `chat()` and `status()` in its adapter (same interface as `ollama.py`), store the key encrypted in the `provider_credentials` table (Fernet, `AIF_ENCRYPTION_KEY`), add pricing to `pricing`, and mark it `implemented = True`. Never put keys in the frontend.

### Supabase
The MVP ships with built-in auth and SQLite/Postgres so it runs without accounts. To use Supabase:
1. Create a Supabase project. Set `AIF_DATABASE_URL` to its Postgres connection string (`postgresql+psycopg://...`), then run `alembic upgrade head`.
2. Run `supabase/migrations/0001_pgvector_and_rls.sql` in the SQL editor (pgvector column + row-level security).
3. Set `AIF_AUTH_MODE=supabase` and `AIF_SUPABASE_JWT_SECRET` (Project settings → API → JWT secret). The backend then accepts Supabase-issued tokens and mirrors users into `users`.
4. **Not done yet:** the frontend's sign-in screens still call the built-in auth endpoints; switching them to `supabase-js` is listed in [docs/STATUS.md](docs/STATUS.md). Uploaded files are stored on local disk, not Supabase Storage.

### Stripe
Not implemented. Plans and limits are defined in `backend/app/services/plans.py` and enforced (monthly runs, agents, documents, published agents, spending limit). The Billing page shows usage and disables “Upgrade” until Stripe Checkout is added.

## Deployment

- **Frontend:** Vercel-compatible. Set `BACKEND_URL` to your API's URL; `/api/*` is proxied server-side, so the browser never talks to the API directly.
- **Backend:** container-ready (`backend/Dockerfile` runs migrations then uvicorn). Use Postgres (`AIF_DATABASE_URL`), a strong `AIF_JWT_SECRET`, `AIF_DEV_SHOW_RESET_TOKEN=false`, `AIF_CORS_ORIGINS=<frontend url>`, and persistent storage for `AIF_UPLOAD_DIR`.
- **AI:** the backend needs network access to an Ollama server (GPU recommended for speed). Rate limiting is in-memory, so run one API instance or move it to Redis before scaling out.

## Repository layout

```
backend/
  app/
    api/          REST endpoints (auth, agents, runs, knowledge, publish, meta)
    architect/    The Architect: request analysis, planner, edit proposals, templates
    workflow/     Block library, schema, validator, engine, layout, templating
    providers/    Model adapters: ollama (real), quotes (no-AI), hosted (disabled), mock (tests only)
    knowledge/    Text extraction, chunking, BM25 + optional embedding search
    services/     Runs, plans/limits, rate limiting, friendly errors
    auth/         Local JWT auth + Supabase JWT verification
    models/       SQLAlchemy tables
  migrations/     Alembic migrations
  tests/          pytest suite
frontend/
  app/            Next.js routes (dashboard, agents, editor, templates, analytics, settings, billing, public chat)
  features/       Editor, Architect chat, knowledge, playground, agent panels
  components/     App shell + shadcn-style UI primitives
  e2e/            Playwright beginner-flow test
supabase/migrations/   pgvector + RLS for the Supabase path
docs/             STATUS (feature checklist), ARCHITECTURE, TESTING
```

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/STATUS.md](docs/STATUS.md) · [docs/TESTING.md](docs/TESTING.md)
