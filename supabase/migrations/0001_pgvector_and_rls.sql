-- Supabase / Postgres hardening for AI Factory.
-- Apply AFTER the backend's Alembic migrations have created the tables (`alembic upgrade head`).
--
-- STATUS: written for the Supabase path but not exercised by the MVP test suite (which runs on
-- SQLite and plain Postgres 16). The backend already enforces ownership on every query; RLS here is
-- defence in depth for anyone querying the database directly with a Supabase user token.

-- 1. pgvector for document embeddings ---------------------------------------------------------
create extension if not exists vector;

-- nomic-embed-text produces 768-dimensional vectors. Change the size if you use another model.
alter table document_chunks add column if not exists embedding_vec vector(768);
create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding_vec vector_cosine_ops) with (lists = 100);

-- Backfill from the JSON column the app writes today.
update document_chunks
   set embedding_vec = (embedding::text)::vector
 where embedding is not null and embedding_vec is null
   and json_array_length(embedding::json) = 768;

-- 2. Row-level security ----------------------------------------------------------------------
-- In Supabase mode, users.id == auth.uid() (the backend mirrors Supabase users on first sign-in).
create or replace function aif_owns_workspace(ws text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspaces w where w.id = ws and w.owner_id = auth.uid()::text)
$$;

do $$
declare t text;
begin
  foreach t in array array['agents','executions','documents','document_chunks','approval_requests',
                           'usage_records','subscriptions','provider_credentials'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all using (aif_owns_workspace(workspace_id)) '
                   'with check (aif_owns_workspace(workspace_id))', t);
  end loop;
end $$;

alter table workspaces enable row level security;
drop policy if exists owner_all on workspaces;
create policy owner_all on workspaces for all using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);

alter table users enable row level security;
drop policy if exists self on users;
create policy self on users for all using (id = auth.uid()::text) with check (id = auth.uid()::text);

-- Tables reached through an agent
do $$
declare t text;
begin
  foreach t in array array['workflow_versions','publications','agent_tests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all using (exists (select 1 from agents a where '
                   'a.id = agent_id and aif_owns_workspace(a.workspace_id)))', t);
  end loop;
end $$;

alter table node_logs enable row level security;
drop policy if exists owner_all on node_logs;
create policy owner_all on node_logs for all using (
  exists (select 1 from executions e where e.id = execution_id and aif_owns_workspace(e.workspace_id)));

-- The FastAPI backend connects with the service role (bypasses RLS) and does its own ownership checks.
