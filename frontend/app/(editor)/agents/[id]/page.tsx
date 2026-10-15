"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { RequireAuth } from "@/lib/auth";
import { WorkflowEditor } from "@/features/workflows/editor";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><Editor id={id} /></Suspense>;
}

function Editor({ id }: { id: string }) {
  const isNew = useSearchParams().get("new") === "1";
  return (
    <RequireAuth>
      <WorkflowEditor agentId={id} isNew={isNew} />
    </RequireAuth>
  );
}
