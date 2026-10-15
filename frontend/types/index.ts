export type User = { id: string; email: string; display_name: string; auth_provider: string };

export type SpecNode = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, any>;
};
export type SpecEdge = { id: string; source: string; target: string; source_handle: string | null };
export type WorkflowSpec = { schema_version: number; nodes: SpecNode[]; edges: SpecEdge[] };

export type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  node_id?: string | null;
  edge_id?: string | null;
};
export type Validation = { ok: boolean; issues: Issue[]; available_vars: Record<string, string[]> };

export type Publication = {
  slug: string;
  is_live: boolean;
  version: number;
  display_name: string;
  description: string;
  welcome_message: string;
  avatar_emoji: string;
  accent_color: string;
  published_at: string | null;
};

export type AgentSummary = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published";
  updated_at: string;
  created_at: string;
  model: string | null;
  executions: number;
  current_version: number;
  public_slug: string | null;
};

export type AgentDetail = AgentSummary & {
  spec: WorkflowSpec;
  validation: Validation;
  publication: Publication | null;
};

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "boolean" | "slider" | "variable" | "provider" | "model";
  help: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
};

export type BlockDef = {
  type: string;
  label: string;
  category: string;
  icon: string;
  color: string;
  summary: string;
  fields: FieldDef[];
  out_handles: string[];
  accepts_input: boolean;
  defaults: Record<string, any>;
};

export type ModelInfo = { id: string; label: string; installed: boolean; supports_temperature: boolean };
export type Provider = {
  id: string;
  name: string;
  kind: string;
  is_generative_ai: boolean;
  implemented: boolean;
  description: string;
  available: boolean;
  status_message: string;
  models: ModelInfo[];
};

export type NodeLog = {
  node_id: string;
  node_type: string;
  label: string;
  status: "succeeded" | "failed" | "skipped" | "paused";
  message: string;
  output_preview: string;
  error: any;
  duration_ms: number;
};

export type Source = { filename: string; page: number | null; source_label: string; excerpt?: string; score: number };

export type Execution = {
  id: string;
  agent_id: string;
  source: string;
  status: "running" | "succeeded" | "failed" | "waiting_approval" | "cancelled" | "rejected";
  inputs: { message?: string };
  reply: string | null;
  sources: Source[];
  error: { code: string; message: string; details?: string; node_id?: string; node_label?: string } | null;
  duration_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  created_at: string;
  logs: NodeLog[];
};

export type Doc = {
  id: string;
  filename: string;
  size_bytes: number;
  status: "ready" | "failed" | "processing";
  error: string | null;
  chunk_count: number;
  index_method: string;
  created_at: string;
};

export type Approval = {
  id: string;
  agent_id: string;
  agent_name: string;
  execution_id: string;
  summary: string;
  status: string;
  created_at: string;
};
