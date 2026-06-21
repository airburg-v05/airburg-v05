"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { AnalysisResult } from "@/lib/analysis/run-analysis";
import {
  AIRBURG_STORAGE_EVENT,
  ANALYSIS_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  type DemoSession,
} from "@/lib/storage/analysis-storage";

const subscribe = (callback: () => void): (() => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(AIRBURG_STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(AIRBURG_STORAGE_EVENT, callback);
  };
};

const getRawSnapshot = (key: string) => (): string | null =>
  window.localStorage.getItem(key);

const getServerSnapshot = (): undefined => undefined;

const parseSnapshot = <T>(rawValue: string | null | undefined): T | null | undefined => {
  if (rawValue === undefined) return undefined;
  if (rawValue === null) return null;

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
};

export const useAnalysisResult = (): AnalysisResult | null | undefined => {
  const rawValue = useSyncExternalStore(
    subscribe,
    getRawSnapshot(ANALYSIS_STORAGE_KEY),
    getServerSnapshot,
  );

  return useMemo(() => parseSnapshot<AnalysisResult>(rawValue), [rawValue]);
};

export const useDemoSession = (): DemoSession | null | undefined => {
  const rawValue = useSyncExternalStore(
    subscribe,
    getRawSnapshot(SESSION_STORAGE_KEY),
    getServerSnapshot,
  );

  return useMemo(() => parseSnapshot<DemoSession>(rawValue), [rawValue]);
};
