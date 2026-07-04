import type { UIState } from "./bi.types";
import { createDefaultBIState } from "./bi.store";
import { loadHomeBIDataSource, type BIHomeDataSource } from "./bi.data-source";
import { buildHomeBIViewModel, type HomeBIViewModel } from "./bi.home-mapper";

export interface LoadHomeBIViewModelResult {
  source: BIHomeDataSource;
  viewModel: HomeBIViewModel;
}

export const loadHomeBIViewModel = async (
  state: UIState = createDefaultBIState(),
): Promise<LoadHomeBIViewModelResult> => {
  const source = await loadHomeBIDataSource();
  return {
    source,
    viewModel: buildHomeBIViewModel(source, state),
  };
};

export { buildHomeBIViewModel } from "./bi.home-mapper";
export type { HomeBIKpiCard, HomeBIViewModel } from "./bi.home-mapper";
