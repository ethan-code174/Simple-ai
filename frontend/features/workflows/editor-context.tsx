"use client";

import { createContext, useContext } from "react";
import type { BlockDef, Issue, NodeLog, Provider } from "@/types";

export type EditorCtx = {
  blocks: Record<string, BlockDef>;
  providers: Provider[];
  issuesByNode: Record<string, Issue[]>;
  runByNode: Record<string, NodeLog>;
  availableVars: Record<string, string[]>;
};

export const EditorContext = createContext<EditorCtx>({ blocks: {}, providers: [], issuesByNode: {}, runByNode: {}, availableVars: {} });
export const useEditor = () => useContext(EditorContext);
