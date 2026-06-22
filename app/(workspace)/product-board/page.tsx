"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductBoardCommandCenter } from "@/components/product-board/v05/product-board-command-center";
import { ProductBoardSafeState } from "@/components/product-board/v05/product-board-safe-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import type { PlatformCode } from "@/lib/v05/domain/models";
import {
  buildEmptyProductBoardViewModel,
  buildInvalidProductBoardViewModel,
  buildLegacyUntrackedProductBoardViewModel,
  buildV2ProductBoardViewModel,
  loadProductBoardContext,
  type ProductBoardLoadResult,
  type ProductBoardMetricKey,
  type ProductBoardPeriod,
} from "@/lib/v05/product-board";
import { DEFAULT_TMALL_STORE_ID } from "@/lib/v05/store-board";

const initialLoadResult: ProductBoardLoadResult = {
  status: "loading",
  context: null,
  message: "正在读取重点商品数据。",
};

const isPlatformCode = (value: string | null): value is PlatformCode =>
  value === "tmall" || value === "jd" || value === "pdd" || value === "douyin" || value === "youzan";

function ProductBoardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlatform = searchParams.get("platform");
  const requestedStoreId = searchParams.get("storeId");
  const requestedTrackedProductId = searchParams.get("trackedProductId");
  const requestedProductId = searchParams.get("productId");
  const platformCode = isPlatformCode(requestedPlatform) ? requestedPlatform : "tmall";
  const storeId = requestedStoreId?.trim() || DEFAULT_TMALL_STORE_ID;
  const [loadResult, setLoadResult] = useState<ProductBoardLoadResult>(initialLoadResult);
  const [selectedPeriod, setSelectedPeriod] = useState<ProductBoardPeriod>("day");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [customDateRange, setCustomDateRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<ProductBoardMetricKey>("gmv");

  useEffect(() => {
    let mounted = true;
    loadProductBoardContext({ platformCode: requestedPlatform, storeId: requestedStoreId })
      .then((result) => {
        if (mounted) setLoadResult(result);
      })
      .catch(() => {
        if (!mounted) return;
        setLoadResult({
          status: "error",
          context: null,
          message: "读取重点商品数据失败，请刷新后重试。",
        });
      });

    return () => {
      mounted = false;
    };
  }, [requestedPlatform, requestedStoreId]);

  const viewModel = useMemo(() => {
    const context = loadResult.context;
    if (loadResult.status === "empty" || !context || context.mode === "empty") {
      return buildEmptyProductBoardViewModel("当前没有 active 多店铺重点商品数据，请先完成数据导入并添加重点商品。");
    }

    if (context.mode === "v2_valid" && context.dataset) {
      return buildV2ProductBoardViewModel({
        dataset: context.dataset,
        platformCode,
        storeId,
        trackedProductId: requestedTrackedProductId,
        productId: requestedProductId,
        selectedPeriod,
        selectedDate,
        customDateRange,
      });
    }

    if (context.mode === "legacy_untracked") {
      return buildLegacyUntrackedProductBoardViewModel(
        "当前只有旧版单店商品数据。新版宝贝看板只展示用户主动添加的重点商品，请完成新数据导入并添加重点商品。",
      );
    }

    if (context.mode === "corrupted" || loadResult.status === "corrupted") {
      return {
        ...buildInvalidProductBoardViewModel({
          mode: "corrupted",
          platformCode: requestedPlatform,
          storeId: requestedStoreId,
          message: "本地多店铺重点商品数据不可安全读取，请前往数据质量页面重新处理。",
        }),
        primaryActions: [
          { label: "查看数据质量", href: "/upload/quality", tone: "blue" as const },
          { label: "数据导入", href: "/upload", tone: "slate" as const },
        ],
      };
    }

    return buildInvalidProductBoardViewModel({
      mode: "error",
      platformCode: requestedPlatform,
      storeId: requestedStoreId,
      message: "读取重点商品数据失败，请刷新后重试。",
    });
  }, [
    customDateRange,
    loadResult.context,
    loadResult.status,
    platformCode,
    requestedPlatform,
    requestedProductId,
    requestedStoreId,
    requestedTrackedProductId,
    selectedDate,
    selectedPeriod,
    storeId,
  ]);

  useEffect(() => {
    const canonicalHref = viewModel.selectedTrackedProduct.canonicalHref;
    if (canonicalHref) router.replace(canonicalHref);
  }, [router, viewModel.selectedTrackedProduct.canonicalHref]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="重点商品看板"
        title="宝贝看板"
        description="按平台、店铺和用户主动添加的重点商品查看经营、推广、目标、趋势和售后安全聚合。"
        action={<StatusPill tone={viewModel.statusTone === "amber" ? "warning" : viewModel.statusTone === "rose" ? "danger" : "info"}>{viewModel.statusLabel}</StatusPill>}
      />

      {loadResult.status === "loading" ? (
        <ProductBoardSafeState
          title="正在读取重点商品数据"
          description="系统正在检查多店铺数据和当前店铺重点商品。"
          actionHref="/upload"
          actionLabel="数据导入"
        />
      ) : null}

      {loadResult.status === "corrupted" || loadResult.status === "error" ? (
        <ProductBoardSafeState
          title={loadResult.status === "corrupted" ? "本地重点商品数据不可安全读取" : "读取重点商品数据失败"}
          description={
            loadResult.status === "corrupted"
              ? "请前往数据质量页面重新处理，不会在宝贝看板展示损坏对象。"
              : "请刷新页面重试；如果仍然失败，请前往数据导入检查当前数据。"
          }
          actionHref="/upload/quality"
          actionLabel="查看数据质量"
        />
      ) : null}

      {loadResult.status === "valid" || loadResult.status === "empty" ? (
        <ProductBoardCommandCenter
          viewModel={viewModel}
          selectedPeriod={selectedPeriod}
          selectedTrendMetric={selectedTrendMetric}
          customDateRange={customDateRange}
          onPeriodChange={setSelectedPeriod}
          onDateChange={setSelectedDate}
          onCustomDateRangeChange={setCustomDateRange}
          onTrendMetricChange={setSelectedTrendMetric}
          onHrefChange={(href) => router.push(href)}
        />
      ) : null}
    </div>
  );
}

export default function ProductBoardPage() {
  return (
    <Suspense
      fallback={
        <ProductBoardSafeState
          title="正在准备宝贝看板"
          description="稍后会读取当前店铺和重点商品上下文。"
        />
      }
    >
      <ProductBoardPageContent />
    </Suspense>
  );
}
