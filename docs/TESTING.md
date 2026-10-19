# Testing

## Backend: 53 tests
```bash
cd backend && pytest -q
```
Covers workflow validation, cycle rejection, invalid config, condition branching, node execution, variable passing, template safety, provider failures (Ollama down, missing model, transient retries), AI-call limits, timeouts, cancellation, human approval pause/resume/reject, prompt-injection guard, the Architect (generation, unsupported features, edits), templates, workflow ownership, public access restrictions, rate limiting, document isolation, upload validation, version restoration, usage limits, automatic tests, password reset, dashboard/analytics, and a full API-level beginner flow.

Results on 2026-10-15: **53 passed on SQLite and 53 passed on Postgres 16** (`AIF_TEST_DATABASE_URL=postgresql+psycopg://...`).

**Mocks are labelled.** No AI model is available in CI, so tests use `MockProvider`, whose replies start with `[TEST MOCK — not AI]`, and a fake HTTP transport for the Ollama adapter. The mock provider only exists when `AIF_ENABLE_TEST_PROVIDER=true`.

## End-to-end (Playwright)
`frontend/e2e/guided-start.spec.ts`: the 5-step guide a beginner uses (sign up → pick a card → name it → upload a document → no-AI fallback → try it → share it → visitor opens the link).

### Advanced editor flow
`frontend/e2e/beginner-flow.spec.ts`: sign up → describe → generated workflow → switch model → upload a document → test run with sources → Architect edit with diff → undo/redo → save version → publish → visitor chats on the public page → dashboard.

```bash
# terminal 1: backend with the labelled test provider
cd backend
AIF_DATABASE_URL=sqlite:///./e2e.db AIF_ENABLE_TEST_PROVIDER=true alembic upgrade head
AIF_DATABASE_URL=sqlite:///./e2e.db AIF_ENABLE_TEST_PROVIDER=true uvicorn app.main:app --port 8000
# terminal 2
cd frontend && npm run build && npm start
# terminal 3
cd frontend && npx playwright install chromium && npm run e2e
```
Result on 2026-10-15: **1 passed** (≈13 s).
