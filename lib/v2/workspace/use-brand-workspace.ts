"use client";

import { useEffect, useState } from "react";
import {
  activeBrandWorkspace,
  BRAND_WORKSPACE_EVENT,
  BRAND_WORKSPACE_STORAGE_KEY,
  createDefaultBrandWorkspaceState,
  loadBrandWorkspaceState,
  type BrandWorkspaceState,
} from "@/lib/v2/workspace/brand-workspace";

export const useBrandWorkspace = () => {
  const [state, setState] = useState<BrandWorkspaceState>(createDefaultBrandWorkspaceState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setState(loadBrandWorkspaceState());
      setHydrated(true);
    };
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === BRAND_WORKSPACE_STORAGE_KEY) refresh();
    };

    refresh();
    window.addEventListener(BRAND_WORKSPACE_EVENT, refresh);
    window.addEventListener("storage", refreshFromStorage);
    return () => {
      window.removeEventListener(BRAND_WORKSPACE_EVENT, refresh);
      window.removeEventListener("storage", refreshFromStorage);
    };
  }, []);

  return {
    state,
    brand: activeBrandWorkspace(state),
    hydrated,
  };
};
