import { parseTmallSeriesGroupStorage } from "../../storage/tmall-series-storage";
import {
  V2_SCHEMA_VERSION,
  type SeriesRecord,
} from "../domain/models";
import {
  DEFAULT_TMAIL_OWNER,
  LEGACY_SERIES_KEY,
  createDryRunIssue,
  type RejectedLegacyRecord,
  type SeriesMappingResult,
} from "./contracts";

interface SeriesMappingInput {
  rawValue: string | null;
  capturedAt: string;
  availableProductIds: Set<string>;
}

const toNonEmptyText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const mapLegacySeriesGroupsToV2 = ({
  rawValue,
  capturedAt,
  availableProductIds,
}: SeriesMappingInput): SeriesMappingResult => {
  const parsed = parseTmallSeriesGroupStorage(rawValue);
  if (parsed.status === "empty") {
    return { status: "empty", series: [], rejectedRecords: [], issues: [] };
  }

  if (parsed.status === "corrupted") {
    return {
      status: "corrupted",
      series: [],
      rejectedRecords: [],
      issues: [
        createDryRunIssue(
          "legacy_parse_failed",
          LEGACY_SERIES_KEY,
          "Legacy series groups could not be parsed safely.",
        ),
      ],
    };
  }

  const rejectedRecords: RejectedLegacyRecord[] = [];
  const series: SeriesRecord[] = [];
  const issues = [];
  const seenSeriesIds = new Set<string>();

  parsed.groups.forEach((group, index) => {
    const path = `seriesGroups[${index}]`;
    const seriesId = toNonEmptyText(group.id);
    const name = toNonEmptyText(group.name);

    if (!seriesId || !name) {
      rejectedRecords.push({
        legacyKey: LEGACY_SERIES_KEY,
        recordType: "series",
        safeIdentity: path,
        issueCodes: ["required_field"],
        paths: [path],
      });
      return;
    }

    if (seenSeriesIds.has(seriesId)) {
      rejectedRecords.push({
        legacyKey: LEGACY_SERIES_KEY,
        recordType: "series",
        safeIdentity: seriesId,
        issueCodes: ["duplicate_key"],
        paths: [`${path}.id`],
      });
      return;
    }
    seenSeriesIds.add(seriesId);

    const productIds = Array.from(
      new Set(group.productIds.map((productId) => productId.trim()).filter(Boolean)),
    );
    const missingProductIds = productIds.filter((productId) => !availableProductIds.has(productId));

    if (missingProductIds.length > 0) {
      rejectedRecords.push({
        legacyKey: LEGACY_SERIES_KEY,
        recordType: "series",
        safeIdentity: seriesId,
        issueCodes: ["reference_missing"],
        paths: [`${path}.productIds`],
      });
      issues.push(
        createDryRunIssue(
          "reference_missing",
          `${path}.productIds`,
          "Series references products that are not present in the migrated business facts.",
          "error",
          { missingProductCount: missingProductIds.length },
        ),
      );
      return;
    }

    series.push({
      schemaVersion: V2_SCHEMA_VERSION,
      seriesId,
      platformCode: DEFAULT_TMAIL_OWNER.platformCode,
      storeId: DEFAULT_TMAIL_OWNER.storeId,
      name,
      productIds,
      status: "active",
      createdAt: toNonEmptyText(group.createdAt) ?? capturedAt,
      updatedAt: toNonEmptyText(group.updatedAt) ?? capturedAt,
    });
  });

  if (rejectedRecords.some((record) => !record.issueCodes.includes("reference_missing"))) {
    issues.push(
      createDryRunIssue(
        "invalid_format",
        LEGACY_SERIES_KEY,
        "Some legacy series groups could not be represented safely.",
        "error",
        { rejectedRecordCount: rejectedRecords.length },
      ),
    );
  }

  return {
    status: "valid",
    series,
    rejectedRecords,
    issues,
  };
};
