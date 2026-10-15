# Architecture

```
Browser ──> Next.js (app router, React Flow editor) ──/api/* rewrite──> FastAPI
                                                                  │
                    ┌─────────────────────────────────────────────┼───────────────────────┐
                    │ Architect (rule-based)   Validator   Engine │  Knowledge (BM25/emb.) │
                    └─────────────────────────────────────────────┼───────────────────────┘
                                                                  │
                         SQLite / Postgres (SQLAlchemy + Alembic) │  Ollama (local models)
```

## Workflow spec
A workflow is validated JSON, never code:

```json
{ "schema_version": 1,
  "nodes": [{ "id": "model_1", "type": "ai_model", "label": "AI brain", "position": {"x":0,"y":0},
              "config": { "provider": "ollama", "model": "llama3.2", "temperature": 0.3 } }],
  "edges": [{ "id": "e1", "source": "condition_1", "target": "approval_1", "source_handle": "true" }] }
```

## Block registry (`backend/app/workflow/blocks.py`)
Each block declares a Pydantic config model, UI field definitions, output handles, the variables it produces/reads, extra validation and an async `execute()`. The frontend renders the library and settings forms from `GET /api/blocks`, and the Architect builds only from this registry, so the UI, the Architect and the engine can't disagree about what exists.

Variables flow by name: Input sets `message`, Knowledge Search sets `knowledge`, Prompt sets `system_prompt`/`user_prompt`, AI Model sets `ai_response` (configurable), Text Transformation sets its output variable, and every block sets `previous`. The validator computes which variables are available at each node and flags references to ones that aren't.

## Validator (`workflow/validator.py`)
Schema parse → block types → config → edges/handles → inputs/outputs → cycle detection (Kahn, deterministic tie-break) → reachability → condition branches → variable flow → provider availability → limits. Issues are `error` (blocks running/publishing) or `warning`, each with a beginner-friendly message and the node it belongs to.

## Engine (`workflow/engine.py`)
Pure and DB-free (`run_workflow(report, ctx)`), so it is unit-tested directly. It walks the topological order; a node runs if it is an Input or any incoming edge is "live" (source ran and, for Conditions, the edge's handle matches the branch taken). Human Approval returns a pause; the engine serialises `{vars, sources, branches, next_index}` and resumes from there after a decision. A whole run is wrapped in `asyncio.wait_for`; cancellation is checked between blocks; providers retry transient errors with backoff.

## Providers (`providers/`)
`ModelProvider` interface: `chat()`, `status()`, `estimate_cost()`, `describe()`, plus `kind`, `is_generative_ai`, `implemented`. Implementations: Ollama (real), Quote Finder (deterministic, not AI), OpenAI/Anthropic/Gemini/xAI (registered, disabled), Mock (only when `AIF_ENABLE_TEST_PROVIDER=true`; replies are prefixed `[TEST MOCK — not AI]`).

## The Architect (`architect/`)
- `analysis.py`: keyword/phrase rules for role, business, needs (documents, bookings, human review), tone, language, and a table of unsupported integrations with explanations.
- `planner.py`: turns an analysis into a spec + explanation; always validated before saving.
- `editor.py`: intent handlers that make targeted edits to a copy of the spec, then a generic diff (added/removed/modified/connections) shown to the user. Applying saves a "before" version and an "after" version.

It's intentionally transparent and limited: when it doesn't understand, it says so and changes nothing. A model-backed Architect can later replace `analyse()`/`propose_edit()` behind the same API, keeping the validator as the gate.

## Data model
`users, workspaces, agents (draft_spec), workflow_versions, publications (published snapshot), executions, node_logs, documents, document_chunks (embedding JSON), approval_requests, usage_records, subscriptions, agent_tests, password_reset_tokens, provider_credentials`. Every user-owned row hangs off a workspace and every query filters by it.
