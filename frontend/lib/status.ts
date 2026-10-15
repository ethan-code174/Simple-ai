export const statusTone = (s: string) =>
  (s === "succeeded" ? "ok" : s === "failed" ? "bad" : s === "waiting_approval" ? "warn" : "default") as "ok" | "bad" | "warn" | "default";

export const statusLabel = (s: string) =>
  ({ succeeded: "Answered", failed: "Failed", waiting_approval: "Waiting for you", rejected: "Rejected", cancelled: "Cancelled", running: "Running" } as Record<string, string>)[s] ?? s;
