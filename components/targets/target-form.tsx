"use client";

import { useMemo, useState, type FormEvent } from "react";
import { SectionCard } from "@/components/ui/section-card";
import {
  buildDefaultTargetName,
  type TmallTargetFormScope,
  type TmallTargetFormValues,
  type TmallTargetProductOption,
  type TmallTargetSeriesOption,
} from "@/lib/tmall/view-models/target-page";
import type { TmallSeriesGroupStorageStatus } from "@/lib/storage/tmall-series-storage";
import {
  getAvailableTargetMetrics,
  getTmallTargetMetricDefinition,
} from "@/lib/tmall/view-models/targets";
import type {
  TmallTargetDefinition,
  TmallTargetMetricKey,
  TmallTargetPeriodType,
  TmallTargetStatus,
} from "@/types/tmall-targets";
import { TargetProductSelector } from "./target-product-selector";
import { TargetSeriesSelector } from "./target-series-selector";
import { formatTargetDirection } from "./target-format";

interface TargetFormProps {
  defaultPeriods: {
    daily: string;
    monthly: string;
  };
  productOptions: TmallTargetProductOption[];
  seriesOptions: TmallTargetSeriesOption[];
  seriesStorageStatus: TmallSeriesGroupStorageStatus;
  editingTarget?: TmallTargetDefinition | null;
  onSubmit: (values: TmallTargetFormValues) => void;
  onCancelEdit: () => void;
}

const DAILY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHLY_PATTERN = /^\d{4}-\d{2}$/;

const weightedLength = (text: string): number =>
  [...text].reduce((total, char) => total + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);

const editableScope = (target: TmallTargetDefinition | null): TmallTargetFormScope =>
  target?.scope === "product" || target?.scope === "series" ? target.scope : "store";

const firstMetricForScope = (scope: TmallTargetFormScope): TmallTargetMetricKey =>
  getAvailableTargetMetrics(scope)[0]?.metricKey ?? "gmv";

const metricAllowedForScope = (
  metricKey: TmallTargetMetricKey,
  scope: TmallTargetFormScope,
): boolean =>
  getAvailableTargetMetrics(scope).some((metric) => metric.metricKey === metricKey);

export function TargetForm({
  defaultPeriods,
  productOptions,
  seriesOptions,
  seriesStorageStatus,
  editingTarget = null,
  onSubmit,
  onCancelEdit,
}: TargetFormProps) {
  const initialScope = editableScope(editingTarget);
  const initialPeriodType = editingTarget?.periodType ?? "daily";
  const initialMetricKey =
    editingTarget && metricAllowedForScope(editingTarget.metricKey, initialScope)
      ? editingTarget.metricKey
      : firstMetricForScope(initialScope);
  const [scope, setScope] = useState<TmallTargetFormScope>(initialScope);
  const metrics = useMemo(() => getAvailableTargetMetrics(scope), [scope]);
  const [name, setName] = useState(
    editingTarget?.name ?? buildDefaultTargetName(initialScope, initialMetricKey, initialPeriodType),
  );
  const [periodType, setPeriodType] = useState<TmallTargetPeriodType>(initialPeriodType);
  const [periodValue, setPeriodValue] = useState(
    editingTarget?.periodValue ??
      (initialPeriodType === "daily" ? defaultPeriods.daily : defaultPeriods.monthly),
  );
  const [metricKey, setMetricKey] = useState<TmallTargetMetricKey>(initialMetricKey);
  const [productId, setProductId] = useState(
    editingTarget?.scope === "product" ? editingTarget.productId ?? "" : "",
  );
  const [seriesId, setSeriesId] = useState(
    editingTarget?.scope === "series" ? editingTarget.seriesId ?? "" : "",
  );
  const [targetValue, setTargetValue] = useState(
    editingTarget ? String(editingTarget.targetValue) : "",
  );
  const [status, setStatus] = useState<TmallTargetStatus>(editingTarget?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const metric = getTmallTargetMetricDefinition(metricKey);

  const handleScopeChange = (nextScope: TmallTargetFormScope) => {
    const previousDefaultName = buildDefaultTargetName(scope, metricKey, periodType);
    const nextMetricKey = metricAllowedForScope(metricKey, nextScope)
      ? metricKey
      : firstMetricForScope(nextScope);

    setScope(nextScope);
    setMetricKey(nextMetricKey);
    setProductId(nextScope === "product" ? productId : "");
    setSeriesId(nextScope === "series" ? seriesId : "");

    if (!name.trim() || name === previousDefaultName) {
      setName(buildDefaultTargetName(nextScope, nextMetricKey, periodType));
    }
  };

  const handlePeriodTypeChange = (nextPeriodType: TmallTargetPeriodType) => {
    const previousDefaultName = buildDefaultTargetName(scope, metricKey, periodType);
    setPeriodType(nextPeriodType);
    setPeriodValue(nextPeriodType === "daily" ? defaultPeriods.daily : defaultPeriods.monthly);

    if (!name.trim() || name === previousDefaultName) {
      setName(buildDefaultTargetName(scope, metricKey, nextPeriodType));
    }
  };

  const handleMetricChange = (nextMetricKey: TmallTargetMetricKey) => {
    const previousDefaultName = buildDefaultTargetName(scope, metricKey, periodType);
    setMetricKey(nextMetricKey);

    if (!name.trim() || name === previousDefaultName) {
      setName(buildDefaultTargetName(scope, nextMetricKey, periodType));
    }
  };

  const setFormError = (message: string): null => {
    setError(message);
    return null;
  };

  const validate = (): TmallTargetFormValues | null => {
    const normalizedName = name.trim();
    const normalizedPeriodValue = periodValue.trim();
    const normalizedProductId = productId.trim();
    const normalizedSeriesId = seriesId.trim();
    const numericTargetValue = Number(targetValue);

    if (!normalizedName) return setFormError("目标名称不能为空。");
    if (weightedLength(normalizedName) > 60) {
      return setFormError("目标名称过长，请控制在 30 个中文字符或 60 个英文字符以内。");
    }
    if (scope === "product" && !normalizedProductId) {
      return setFormError("宝贝目标必须选择商品。");
    }
    if (scope === "series" && !normalizedSeriesId) {
      return setFormError("系列目标必须选择系列。");
    }
    if (periodType === "daily" && !DAILY_PATTERN.test(normalizedPeriodValue)) {
      return setFormError("日目标日期格式必须是 YYYY-MM-DD。");
    }
    if (periodType === "monthly" && !MONTHLY_PATTERN.test(normalizedPeriodValue)) {
      return setFormError("月目标月份格式必须是 YYYY-MM。");
    }
    if (!Number.isFinite(numericTargetValue) || numericTargetValue <= 0) {
      return setFormError("目标值必须是有限正数，不能为 0 或负数。");
    }

    setError(null);
    return {
      name: normalizedName,
      scope,
      productId: scope === "product" ? normalizedProductId : undefined,
      seriesId: scope === "series" ? normalizedSeriesId : undefined,
      periodType,
      periodValue: normalizedPeriodValue,
      metricKey,
      targetValue: numericTargetValue,
      status,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = validate();
    if (!values) return;
    onSubmit(values);
  };

  return (
    <SectionCard
      title={editingTarget ? "编辑目标" : "新建目标"}
      description="当前支持店铺目标、宝贝目标和系列目标。"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">目标范围</span>
            <select
              className="form-input mt-2"
              value={scope}
              onChange={(event) => handleScopeChange(event.target.value as TmallTargetFormScope)}
            >
              <option value="store">店铺目标</option>
              <option value="product">宝贝目标</option>
              <option value="series">系列目标</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">目标名称</span>
            <input
              className="form-input mt-2"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                scope === "store"
                  ? "例如：店铺日 GMV 目标"
                  : scope === "product"
                    ? "例如：宝贝日 GMV 目标"
                    : "例如：系列日 GMV 目标"
              }
            />
          </label>

          {scope === "product" ? (
            <div className="lg:col-span-2">
              <span className="text-sm font-semibold text-slate-700">选择商品</span>
              <div className="mt-2">
                <TargetProductSelector
                  options={productOptions}
                  value={productId}
                  onChange={setProductId}
                />
              </div>
            </div>
          ) : null}

          {scope === "series" ? (
            <div className="lg:col-span-2">
              <span className="text-sm font-semibold text-slate-700">选择系列</span>
              <div className="mt-2">
                <TargetSeriesSelector
                  options={seriesOptions}
                  storageStatus={seriesStorageStatus}
                  value={seriesId}
                  onChange={setSeriesId}
                />
              </div>
            </div>
          ) : null}

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">目标指标</span>
            <select
              className="form-input mt-2"
              value={metricKey}
              onChange={(event) => handleMetricChange(event.target.value as TmallTargetMetricKey)}
            >
              {metrics.map((item) => (
                <option key={item.metricKey} value={item.metricKey}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">目标周期</span>
            <select
              className="form-input mt-2"
              value={periodType}
              onChange={(event) => handlePeriodTypeChange(event.target.value as TmallTargetPeriodType)}
            >
              <option value="daily">日目标</option>
              <option value="monthly">月目标</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              {periodType === "daily" ? "目标日期" : "目标月份"}
            </span>
            <input
              className="form-input mt-2"
              value={periodValue}
              onChange={(event) => setPeriodValue(event.target.value)}
              placeholder={periodType === "daily" ? "YYYY-MM-DD" : "YYYY-MM"}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">目标值</span>
            <input
              className="form-input mt-2"
              value={targetValue}
              inputMode="decimal"
              onChange={(event) => setTargetValue(event.target.value)}
              placeholder="例如：100000"
            />
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              金额和整数直接输入数字；比率输入小数，例如 0.01 表示 1%；ROI 输入倍数。
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">状态</span>
            <select
              className="form-input mt-2"
              value={status}
              onChange={(event) => setStatus(event.target.value as TmallTargetStatus)}
            >
              <option value="active">启用</option>
              <option value="paused">暂停</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
          <p className="font-semibold">指标方向：{formatTargetDirection(metric.direction)}</p>
          <p>{metric.helper}</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="submit" className="primary-button justify-center">
            {editingTarget ? "保存修改" : "创建目标"}
          </button>
          {editingTarget ? (
            <button type="button" className="secondary-button justify-center" onClick={onCancelEdit}>
              取消编辑
            </button>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}
