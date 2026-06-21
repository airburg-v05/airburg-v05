import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/section-card";
import type { TmallTargetProgress } from "@/lib/tmall/view-models/targets";
import type {
  TmallTargetProductOption,
  TmallTargetSeriesOption,
} from "@/lib/tmall/view-models/target-page";
import { TargetCard } from "./target-card";

interface TargetListProps {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  progressItems: TmallTargetProgress[];
  productOptions?: TmallTargetProductOption[];
  seriesOptions?: TmallTargetSeriesOption[];
  action?: ReactNode;
  onEdit: (targetId: string) => void;
  onToggleStatus: (targetId: string) => void;
  onDelete: (targetId: string) => void;
}

export function TargetList({
  title,
  description,
  emptyTitle,
  emptyDescription,
  progressItems,
  productOptions = [],
  seriesOptions = [],
  action,
  onEdit,
  onToggleStatus,
  onDelete,
}: TargetListProps) {
  const productOptionMap = new Map(
    productOptions.map((option) => [option.productId, option]),
  );
  const seriesOptionMap = new Map(
    seriesOptions.map((option) => [option.seriesId, option]),
  );

  return (
    <SectionCard title={title} description={description} action={action}>
      {progressItems.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
          <h3 className="text-sm font-semibold text-slate-900">{emptyTitle}</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{emptyDescription}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {progressItems.map((progress) => (
            <TargetCard
              key={progress.target.id}
              progress={progress}
              productOption={
                progress.target.productId
                  ? productOptionMap.get(progress.target.productId)
                  : undefined
              }
              seriesOption={
                progress.target.seriesId
                  ? seriesOptionMap.get(progress.target.seriesId)
                  : undefined
              }
              onEdit={() => onEdit(progress.target.id)}
              onToggleStatus={() => onToggleStatus(progress.target.id)}
              onDelete={() => onDelete(progress.target.id)}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
