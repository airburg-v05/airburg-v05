"use client";

import { useMemo, useState } from "react";
import { RawDataSafeInspectionCenter } from "@/components/raw-data/raw-data-safe-inspection-center";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { useTmallAnalysisResult } from "@/lib/storage/use-tmall-analysis-result";
import {
  buildTmallRawDataSafeInspection,
  type RawDataSafeSourceKey,
} from "@/lib/tmall/view-models/raw-data-safe-inspection";

export default function RawDataPage() {
  const analysisState = useTmallAnalysisResult();
  const analysis = analysisState.status === "valid" ? analysisState.result : null;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<RawDataSafeSourceKey>("business_product");
  const [searchTerm, setSearchTerm] = useState("");
  const inspection = useMemo(
    () =>
      buildTmallRawDataSafeInspection({
        analysisStatus: analysisState.status,
        analysis,
        selectedDate,
      }),
    [analysis, analysisState.status, selectedDate],
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="安全数据查看"
        title="原始数据安全查看"
        description="按四源、日期和关键词查看当前浏览器中的安全聚合结果，用于复核上传数据和辅助排查数据质量提示。"
        action={<StatusPill tone="info">安全聚合</StatusPill>}
      />

      <RawDataSafeInspectionCenter
        inspection={inspection}
        activeSource={activeSource}
        searchTerm={searchTerm}
        onSourceChange={setActiveSource}
        onSearchTermChange={setSearchTerm}
        onDateChange={(date) => {
          setSelectedDate(date);
          setSearchTerm("");
        }}
      />
    </div>
  );
}
