# Feature status

Honest checklist as of 2026-10-15. ✅ works and is tested · 🟡 works with a stated limitation · ❌ not built.

## The vertical slice: create → edit → test → save → publish
✅ Verified end to end in a real browser by `frontend/e2e/beginner-flow.spec.ts` (with the labelled test-mock model, because no AI model is available in CI).

## Accounts & security
| | Feature | Notes |
|---|---|---|
| ✅ | Sign up, sign in, sign out, update profile | Built-in email + bcrypt + JWT |
| 🟡 | Password reset | Token flow works; **no email is sent**. In dev the reset link is shown on screen (`AIF_DEV_SHOW_RESET_TOKEN`). |
| 🟡 | Supabase Auth | Backend verifies Supabase JWTs (`AIF_AUTH_MODE=supabase`); frontend sign-in screens not yet switched to supabase-js. |
| ✅ | Ownership checks on every endpoint | Tested: other users get 404 for agents, runs, documents, publishing |
| 🟡 | Row-level security | SQL provided in `supabase/migrations`; not exercised by tests |
| ✅ | Upload validation, size limits, path-traversal-safe names | |
| ✅ | Prompt-injection guard | Documents are wrapped in `<documents>` with a rule to treat them as data |
| ✅ | Rate limiting on public + auth endpoints | In-memory (single instance) |
| 🟡 | Encrypted provider credentials | Table + Fernet setting exist; unused because hosted providers are off |

## Dashboard & agents
| | Feature | Notes |
|---|---|---|
| ✅ | Totals, live agents, runs, estimated cost, recent activity, recently edited | Real DB records; empty state for new users |
| ✅ | Agent cards: open, duplicate, rename, delete, publish/unpublish | |
| ✅ | Pending approvals banner + Approvals page | |

## The Architect (no hosted AI)
| | Feature | Notes |
|---|---|---|
| 🟡 | Plain English → workflow | **Rule-based** keyword/phrase understanding, not an LLM. Handles roles (receptionist, support, FAQ, document Q&A, email, research, tutor, writer, translator), business name, documents, bookings, human review, tone, language. Unrecognised requests get a general assistant plus an honest note. |
| ✅ | Only real blocks; validated before saving | Tested for many prompts and all templates |
| ✅ | Unsupported requests explained | Email sending, SMS/WhatsApp, calendars, Slack, web search, payments, voice, CRM, images |
| ✅ | Chat edits with diff → accept/discard → versioned | Add human review, add/remove document search, tone, language, always/never rules, word/char limits, signatures, show sources, creativity, switch model, rename/remove blocks |
| 🟡 | “Complicated question” detection | Deterministic stand-in: message longer than 40 words, or contains chosen keywords. Editable in the Condition block. |

## Visual editor
✅ Drag from library, click to add (auto-connects after the selected block), connect by dragging a wire (drop it on a block's body or on empty canvas to pick a new connected block) or from the Connections list in block settings, connect with validation (no loops, no input into Input, nothing out of Output), delete, duplicate, rename, move, zoom, pan, fit, auto-layout, undo/redo (incl. Architect changes), autosave, keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y, Ctrl+S, Ctrl+D, Delete, F), error/warning indicators on blocks, Problems panel, plain-English description on every block, settings panel driven by the backend block registry.

🟡 Desktop-first: the editor needs ~1100px width; other pages are responsive.

## Blocks (all have schema, validation and an execution handler)
✅ Input · Prompt · AI Model (each one can be its own agent: own model, own job and own task, e.g. writer → reviewer on different models) · Condition (12 deterministic operators) · Output · Knowledge Search · Human Approval (pause/resume, approve/reject) · Text Transformation (10 operations)

## Execution engine
✅ Graph validation, cycle detection, config validation, variable-flow checks, deterministic order, branch execution, variable passing, structured friendly errors, node logs, per-run timeout, retries for transient provider errors, AI-call limit, usage + cost tracking, cancellation between blocks, run persistence, node/edge/concurrency/monthly-run/spend limits. No user code is ever executed; `{{templates}}` only substitute plain variable names.

## AI providers
| | Provider | Notes |
|---|---|---|
| ✅ | Ollama (local) | Real adapter. Tested with a fake HTTP transport; **not run against a live model in this environment** (Ollama couldn't be downloaded here). |
| ✅ | Document Quote Finder | Deterministic, labelled “not AI” |
| ❌ | OpenAI, Anthropic, Gemini, xAI | Adapters registered but disabled by design for the MVP |
| ❌ | Economy/Balanced/Quality routing | Not started (spec says to wait) |

## Knowledge
| | Feature | Notes |
|---|---|---|
| ✅ | Upload PDF/TXT/MD, validate, extract, chunk, store, delete, re-index | Text PDFs only; scanned PDFs get a clear “no OCR yet” message |
| 🟡 | Search | BM25 keyword search always; hybrid semantic search when Ollama has `nomic-embed-text`. Similarity is computed in Python; the pgvector column/index exists in the Supabase SQL but isn't queried yet. |
| ✅ | Source references in replies | |
| ✅ | Isolation per user and per agent | Tested |
| 🟡 | File storage | Local disk, not Supabase Storage |

## Testing playground
✅ Real workflow runs, reply, status, blocks executed, failed block, time, tokens, cost, sources, friendly errors with technical details, approve/reject paused runs inline, run log, conversation memory.
✅ Automatic tests: contains / not contains / equals / max length / uses documents / runs without errors.
❌ AI-graded evaluation (would need a model; labelled as unavailable).

## Publishing
✅ Hosted chat page `/a/<slug>`, custom name/description/welcome/emoji/colour/slug, publish/unpublish, snapshot (draft edits don't go live until re-publish), blocked when the workflow has errors, rate-limited, visitors never see logs or prompts, approval-paused replies arrive by polling.
❌ Embeddable widget, API access, messaging integrations (spec says later).

## Templates
✅ Customer Support, Business FAQ, Document Q&A, Email Drafting, Research (all runnable). Two shown as unavailable with reasons (CRM lead capture, inbox auto-reply).

## Analytics & billing
✅ Runs, successes, failures, avg time, tokens, estimated cost, per-day chart, per-agent table, empty states.
❌ Satisfaction, unanswered questions, suggestions.
✅ Plan definitions in one place and enforced; usage warning; spending limit.
❌ Stripe checkout/subscriptions.

## Not yet validated
The “idea to published agent in under 10 minutes” goal has not been tested with real users. With Ollama installed, the automated flow takes about 15 seconds of clicks; real users will need time to read and upload documents.
