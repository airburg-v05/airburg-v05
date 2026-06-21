"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  TMALL_ANALYSIS_STORAGE_EVENT,
  TMALL_ANALYSIS_STORAGE_KEY,
} from "@/lib/storage/tmall-analysis-storage";
import {
  parseTmallStoredAnalysisResult,
  type TmallStoredAnalysisParseResult,
} from "@/lib/storage/tmall-analysis-validator";

const subscribe = (callback: () => void): (() => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(TMALL_ANALYSIS_STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TMALL_ANALYSIS_STORAGE_EVENT, callback);
  };
};

const getRawSnapshot = (): string | null =>
  window.localStorage.getItem(TMALL_ANALYSIS_STORAGE_KEY);

const getServerSnapshot = (): undefined => undefined;

export const useTmallAnalysisResult = (): TmallStoredAnalysisParseResult => {
  const rawValue = useSyncExternalStore(subscribe, getRawSnapshot, getServerSnapshot);
  return useMemo(() => parseTmallStoredAnalysisResult(rawValue), [rawValue]);
};
