export const statusTone = (s: string) =>
  (s === "succeeded" ? "ok" : s === "failed" ? "bad" : s === "waiting_approval" ? "warn" : "default") as "ok" | "bad" | "warn" | "default";

export const statusLabel = (s: string) =>
  ({ succeeded: "Answered", failed: "Didn't work", waiting_approval: "Waiting for you", rejected: "Not sent", cancelled: "Stopped", running: "Working on it", queued: "Waiting to start", pending: "Waiting to start" } as Record<string, string>)[s] ?? s;
