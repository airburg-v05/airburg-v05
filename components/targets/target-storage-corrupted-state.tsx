import { AlertIcon } from "@/components/icons";
import { SectionCard } from "@/components/ui/section-card";

interface TargetStorageCorruptedStateProps {
  onClear: () => void;
}

export function TargetStorageCorruptedState({
  onClear,
}: TargetStorageCorruptedStateProps) {
  return (
    <SectionCard>
      <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <AlertIcon className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          本地目标数据不完整或已损坏，请清除后重新创建目标。
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
          系统不会自动删除损坏数据。清除目标数据不会删除四源分析结果，也不会影响系列分组。
        </p>
        <button type="button" className="secondary-button mt-5" onClick={onClear}>
          清除损坏目标数据
        </button>
      </div>
    </SectionCard>
  );
}
