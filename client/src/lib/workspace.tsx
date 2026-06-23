import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setActiveWorkspaceId, type Workspace } from "./api.js";
import { useAuth } from "./auth.js";

export const WORKSPACE_KEY = "lore_ws";

type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setActiveWorkspace: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveId] = useState<string | null>(() => {
    const persisted = localStorage.getItem(WORKSPACE_KEY);
    // Seed the api header from persistence so the very first requests are scoped.
    setActiveWorkspaceId(persisted);
    return persisted;
  });

  // On authentication, fetch the user's workspaces and resolve the active one.
  useEffect(() => {
    if (!isAuthenticated) {
      setWorkspaces([]);
      return;
    }
    let cancelled = false;
    api.workspaces
      .list()
      .then((list) => {
        if (cancelled) return;
        setWorkspaces(list);
        const persisted = localStorage.getItem(WORKSPACE_KEY);
        const resolved =
          (persisted && list.some((w) => w.id === persisted) ? persisted : list[0]?.id) ?? null;
        setActiveId(resolved);
        setActiveWorkspaceId(resolved);
        if (resolved) localStorage.setItem(WORKSPACE_KEY, resolved);
      })
      .catch(() => {
        /* membership/auth errors surface via the 401 handler in api.ts */
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Clear workspace state on logout.
  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.removeItem(WORKSPACE_KEY);
      setActiveId(null);
      setActiveWorkspaceId(null);
    }
  }, [isAuthenticated]);

  const setActiveWorkspace = useCallback(
    (id: string) => {
      if (id === activeWorkspaceId) return;
      localStorage.setItem(WORKSPACE_KEY, id);
      setActiveId(id);
      setActiveWorkspaceId(id);
      // Drop all cached data so every page refetches under the new workspace header.
      queryClient.clear();
    },
    [activeWorkspaceId, queryClient]
  );

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspaceId, setActiveWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
