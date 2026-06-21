"use client";

import { DatabaseIcon } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";

interface TmallUploadActionsProps {
  validFileCount: number;
  blockedReason: string | null;
  isAnalyzing: boolean;
  hasResult: boolean;
  isHistoryResult: boolean;
  onAnalyze: () => void;
  onClearSelection: () => void;
  onClearStoredResult: () => void;
}

export function TmallUploadActions({
  validFileCount,
  blockedReason,
  isAnalyzing,
  hasResult,
  isHistoryResult,
  onAnalyze,
  onClearSelection,
  onClearStoredResult,
}: TmallUploadActionsProps) {
  const canAnalyze = validFileCount > 0 && !blockedReason && !isAnalyzing;

  return (
    <section className="panel">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">分析操作</p>
            <StatusPill tone={validFileCount > 0 ? "success" : "neutral"}>
              已识别 {validFileCount} 个来源
            </StatusPill>
            {hasResult ? (
              <StatusPill tone={isHistoryResult ? "info" : "success"}>
                {isHistoryResult ? "已恢复上次结果" : "本次结果已保存"}
              </StatusPill>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            至少选择一个识别成功的来源即可分析；未上传来源会标记为未上传，相关指标保持空值或缺失提示。
          </p>
          {blockedReason ? <p className="mt-2 text-sm text-rose-600">{blockedReason}</p> : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className="primary-button justify-center"
            disabled={!canAnalyze}
            onClick={onAnalyze}
          >
            {isAnalyzing ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                正在分析
              </>
            ) : (
              <>
                <DatabaseIcon className="h-4 w-4" />
                开始四源分析
              </>
            )}
          </button>
          <button type="button" className="secondary-button justify-center" onClick={onClearSelection}>
            清空本次选择
          </button>
          <button
            type="button"
            className="secondary-button justify-center"
            disabled={!hasResult}
            onClick={onClearStoredResult}
          >
            清除本地结果
          </button>
        </div>
      </div>
    </section>
  );
}
