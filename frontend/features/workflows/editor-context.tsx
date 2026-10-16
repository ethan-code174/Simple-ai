"use client";

import { createContext, useContext } from "react";
import type { BlockDef, Issue, NodeLog, Provider } from "@/types";

export type EditorCtx = {
  blocks: Record<string, BlockDef>;
  providers: Provider[];
  issuesByNode: Record<string, Issue[]>;
  runByNode: Record<string, NodeLog>;
  availableVars: Record<string, string[]>;
  /** Open the "add a connected block" menu for a block's output (the + button on a block). */
  addAfter?: (nodeId: string, handle: string, at: { x: number; y: number }) => void;
  removeEdge?: (edgeId: string) => void;
};

export const EditorContext = createContext<EditorCtx>({ blocks: {}, providers: [], issuesByNode: {}, runByNode: {}, availableVars: {} });
export const useEditor = () => useContext(EditorContext);
