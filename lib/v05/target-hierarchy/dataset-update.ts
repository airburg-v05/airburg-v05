import { validateV2Dataset } from "../validation/dataset";
import type { TargetRecord, V2Dataset } from "../domain/models";
import type { ValidationResult } from "../domain/results";

export interface BuildTargetHierarchyDatasetCandidateInput {
  dataset: V2Dataset;
  nextDatasetId: string;
  targets: TargetRecord[];
}

export interface BuildTargetHierarchyDatasetCandidateResult {
  dataset: V2Dataset;
  validation: ValidationResult;
}

export const buildTargetHierarchyDatasetCandidate = ({
  dataset,
  nextDatasetId,
  targets,
}: BuildTargetHierarchyDatasetCandidateInput): BuildTargetHierarchyDatasetCandidateResult => {
  const candidate: V2Dataset = {
    ...JSON.parse(JSON.stringify(dataset)),
    datasetId: nextDatasetId,
    targets: JSON.parse(JSON.stringify(targets)) as TargetRecord[],
    activeDatasetPointer: null,
  };

  return {
    dataset: candidate,
    validation: validateV2Dataset(candidate),
  };
};
