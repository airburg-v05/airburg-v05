import type { BIMetricKey, BITimeRange, UIState } from "./bi.types";

export type BIStatePatch = Partial<UIState>;

export type BIStateUpdater = (state: UIState) => UIState;

export type BIStateListener = (state: UIState, previousState: UIState) => void;

export interface BIStore {
  getState: () => UIState;
  setState: (patchOrUpdater: BIStatePatch | BIStateUpdater) => UIState;
  reset: () => UIState;
  subscribe: (listener: BIStateListener) => () => void;
  setSelectedPlatform: (platformCode: string | null) => UIState;
  setSelectedSeries: (seriesId: string | null) => UIState;
  setSelectedStores: (storeIds: string[]) => UIState;
  setTimeRange: (timeRange: BITimeRange) => UIState;
  setSelectedMetric: (metricKey: BIMetricKey) => UIState;
}

export const createDefaultBITimeRange = (): BITimeRange => ({
  mode: "day",
  startDate: null,
  endDate: null,
});

export const createDefaultBIState = (): UIState => ({
  selectedPlatform: null,
  selectedSeries: null,
  selectedStores: [],
  timeRange: createDefaultBITimeRange(),
  selectedMetric: "gmv",
  excludedProductIds: [],
  excludedRemarkKeywords: [],
  targetDrafts: {},
});

const cloneState = (state: UIState): UIState => ({
  ...state,
  selectedStores: [...state.selectedStores],
  excludedProductIds: [...state.excludedProductIds],
  excludedRemarkKeywords: [...state.excludedRemarkKeywords],
  targetDrafts: { ...state.targetDrafts },
  timeRange: { ...state.timeRange },
});

const normalizeStoreIds = (storeIds: string[]): string[] =>
  Array.from(new Set(storeIds.map((storeId) => storeId.trim()).filter(Boolean))).sort();

export const createBIStore = (initialState: UIState = createDefaultBIState()): BIStore => {
  let state = cloneState(initialState);
  const listeners = new Set<BIStateListener>();

  const notify = (nextState: UIState, previousState: UIState) => {
    listeners.forEach((listener) => listener(cloneState(nextState), cloneState(previousState)));
  };

  const setState = (patchOrUpdater: BIStatePatch | BIStateUpdater): UIState => {
    const previousState = cloneState(state);
    const nextState =
      typeof patchOrUpdater === "function"
        ? patchOrUpdater(cloneState(state))
        : {
            ...state,
            ...patchOrUpdater,
          };

    state = {
      ...nextState,
      selectedStores: normalizeStoreIds(nextState.selectedStores),
      excludedProductIds: normalizeStoreIds(nextState.excludedProductIds),
      excludedRemarkKeywords: normalizeStoreIds(nextState.excludedRemarkKeywords),
      targetDrafts: { ...nextState.targetDrafts },
      timeRange: { ...nextState.timeRange },
    };
    notify(state, previousState);
    return cloneState(state);
  };

  return {
    getState: () => cloneState(state),
    setState,
    reset: () => {
      const previousState = cloneState(state);
      state = cloneState(initialState);
      notify(state, previousState);
      return cloneState(state);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSelectedPlatform: (platformCode) => setState({ selectedPlatform: platformCode }),
    setSelectedSeries: (seriesId) => setState({ selectedSeries: seriesId }),
    setSelectedStores: (storeIds) => setState({ selectedStores: storeIds }),
    setTimeRange: (timeRange) => setState({ timeRange }),
    setSelectedMetric: (metricKey) => setState({ selectedMetric: metricKey }),
  };
};

export const biStore = createBIStore();
