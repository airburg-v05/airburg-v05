import type { AnalysisResult } from "@/lib/analysis/run-analysis";

export const ANALYSIS_STORAGE_KEY = "airburg:last-analysis";
export const SESSION_STORAGE_KEY = "airburg:demo-session";
export const AIRBURG_STORAGE_EVENT = "airburg-storage-change";

export interface DemoSession {
  account: string;
  loggedInAt: string;
}

const notifyStorageChange = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AIRBURG_STORAGE_EVENT));
};

export const saveAnalysisResult = (result: AnalysisResult): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(result));
  notifyStorageChange();
};

export const loadAnalysisResult = (): AnalysisResult | null => {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ANALYSIS_STORAGE_KEY);
    return value ? (JSON.parse(value) as AnalysisResult) : null;
  } catch {
    return null;
  }
};

export const clearAnalysisResult = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ANALYSIS_STORAGE_KEY);
  notifyStorageChange();
};

export const saveDemoSession = (account: string): void => {
  if (typeof window === "undefined") return;
  const session: DemoSession = {
    account,
    loggedInAt: new Date().toISOString(),
  };
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  notifyStorageChange();
};

export const loadDemoSession = (): DemoSession | null => {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return value ? (JSON.parse(value) as DemoSession) : null;
  } catch {
    return null;
  }
};

export const clearDemoSession = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  notifyStorageChange();
};
