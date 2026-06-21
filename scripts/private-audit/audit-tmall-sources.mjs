import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import Papa from "papaparse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const FILES = {
  businessProduct: {
    label: "生意参谋商品表",
    path: path.join(ROOT, "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls"),
  },
  adProduct: {
    label: "商品报表",
    path: path.join(ROOT, "private-samples/tmall/ad-product/商品报表_20260619_110309.csv"),
  },
  adPlan: {
    label: "计划报表",
    path: path.join(ROOT, "private-samples/tmall/ad-plan/计划报表_20260619_110330.csv"),
  },
  afterSales: {
    label: "当日售后退货表",
    path: path.join(ROOT, "private-samples/tmall/after-sales/当日售后退货表.xlsx"),
  },
};

const HEADER_KEYWORDS = [
  "商品",
  "访客",
  "金额",
  "买家",
  "计划",
  "主体",
  "退款",
  "订单",
  "日期",
  "时间",
  "展现",
  "点击",
  "转化",
];

const SENSITIVE_HEADER_PATTERNS = [
  /订单号/,
  /支付宝交易号/,
  /手机号/,
  /手机/,
  /电话/,
  /地址/,
  /收件人/,
  /物流单号/,
  /运单号/,
  /操作人/,
];

const normalizeHeader = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "")
    .trim();

const normalizeId = (value) => {
  if (value === null || value === undefined) return "";
  let text = String(value).trim();
  if (!text) return "";
  if (/^\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, "");
  return text;
};

const isEmptyCell = (value) => value === null || value === undefined || String(value).trim() === "";

const isEmptyRow = (row) => row.every(isEmptyCell);

const countChinese = (text) => {
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
};

const decodeText = (buffer) => {
  const candidates = ["utf-8", "gb18030", "gbk", "big5"];
  const scored = candidates.map((encoding) => {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      return {
        encoding,
        text,
        score: countChinese(text) - (text.match(/\uFFFD/g)?.length ?? 0) * 10,
      };
    } catch {
      return { encoding, text: "", score: Number.NEGATIVE_INFINITY };
    }
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
};

const detectHeaderRowIndex = (rows) => {
  const limit = Math.min(rows.length, 30);
  let best = { index: 0, score: Number.NEGATIVE_INFINITY };

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index] ?? [];
    const cells = row.map((cell) => normalizeHeader(cell)).filter(Boolean);
    const uniqueCount = new Set(cells).size;
    const keywordHits = cells.filter((cell) => HEADER_KEYWORDS.some((keyword) => cell.includes(keyword))).length;
    const score = cells.length * 2 + uniqueCount + keywordHits * 8;
    if (cells.length >= 2 && score > best.score) best = { index, score };
  }

  return best.index;
};

const rowsToObjects = (headers, rows) =>
  rows.map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] ?? null;
    });
    return item;
  });

const readCsv = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const decoded = decodeText(buffer);
  const parsed = Papa.parse(decoded.text, {
    header: false,
    skipEmptyLines: false,
  });
  const rows = parsed.data.map((row) => (Array.isArray(row) ? row : []));
  return { rows, encoding: decoded.encoding, sheetNames: [], sheetCount: 0 };
};

const readExcel = (filePath) => {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    raw: false,
    defval: "",
  });
  return {
    rows,
    encoding: null,
    sheetNames: workbook.SheetNames,
    sheetCount: workbook.SheetNames.length,
  };
};

const readTable = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".csv") return readCsv(filePath);
  return readExcel(filePath);
};

const findHeader = (headers, patterns) => {
  const normalized = headers.map((header) => normalizeHeader(header).toLowerCase());
  for (const pattern of patterns) {
    const needle = normalizeHeader(pattern).toLowerCase();
    const index = normalized.findIndex((header) => header === needle || header.includes(needle));
    if (index >= 0) return headers[index];
  }
  return null;
};

const summarizeFormats = (headers, objects) => {
  const dateHeaders = headers.filter((header) => /日期|时间|date/i.test(header));
  const amountHeaders = headers.filter((header) => /金额|花费|成本|成交|付款|退款|客单价|收入|GMV|GSV|CPC|CPM|ROI/i.test(header));
  const percentHeaders = headers.filter((header) => /率|占比|CTR|CVR/i.test(header));
  const idHeaders = headers.filter((header) => /id|ID|编号|订单号|主体|计划/i.test(header));

  const inspectHeader = (header) => {
    const values = objects.map((row) => row[header]).filter((value) => !isEmptyCell(value));
    const textValues = values.map((value) => String(value).trim());
    return {
      header,
      nonEmptyCount: values.length,
      formats: {
        hasPercentSign: textValues.some((value) => value.includes("%")),
        hasCurrencySymbol: textValues.some((value) => /¥|￥/.test(value)),
        hasComma: textValues.some((value) => /,\d{3}/.test(value)),
        hasScientificNotation: textValues.some((value) => /^\d+(\.\d+)?e\+?\d+$/i.test(value)),
        longNumericLikeCount: textValues.filter((value) => /^\d{15,}$/.test(value)).length,
        dateLikeCount: textValues.filter((value) => /\d{4}[-/年]\d{1,2}|^\d{8}$|\d{1,2}:\d{2}/.test(value)).length,
      },
    };
  };

  return {
    dateHeaders: dateHeaders.map(inspectHeader),
    amountHeaders: amountHeaders.map(inspectHeader),
    percentHeaders: percentHeaders.map(inspectHeader),
    idHeaders: idHeaders.map(inspectHeader),
  };
};

const summarizeTable = (key, config) => {
  const filePath = config.path;
  const stats = fs.statSync(filePath);
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const raw = readTable(filePath);
  const rows = raw.rows;
  const headerRowIndex = detectHeaderRowIndex(rows);
  const headers = (rows[headerRowIndex] ?? []).map(normalizeHeader);
  const dataRowsRaw = rows.slice(headerRowIndex + 1).filter((row) => !isEmptyRow(row));
  const objects = rowsToObjects(headers, dataRowsRaw);
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const duplicateHeaders = headers.filter((header, index) => header && normalizedHeaders.indexOf(header.toLowerCase()) !== index);
  const rowFingerprints = new Map();
  dataRowsRaw.forEach((row) => {
    const fingerprint = JSON.stringify(row.map((value) => String(value ?? "").trim()));
    rowFingerprints.set(fingerprint, (rowFingerprints.get(fingerprint) ?? 0) + 1);
  });
  const duplicateDataRows = [...rowFingerprints.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
  const summaryRows = dataRowsRaw.filter((row) => row.some((cell) => /合计|总计|汇总/.test(String(cell ?? "")))).length;
  const emptyRows = rows.filter(isEmptyRow).length;
  const emptyColumns = headers.filter((header) => !header).length;
  const sensitiveHeaders = headers.filter((header) => SENSITIVE_HEADER_PATTERNS.some((pattern) => pattern.test(header)));
  const formats = summarizeFormats(headers, objects);

  return {
    key,
    label: config.label,
    fileName: path.basename(filePath),
    privatePath: path.relative(ROOT, filePath),
    extension,
    sizeBytes: stats.size,
    csvEncoding: raw.encoding,
    sheetCount: raw.sheetCount,
    sheetNames: raw.sheetNames,
    headerRowNumber: headerRowIndex + 1,
    rawRowCount: rows.length,
    dataRowCount: dataRowsRaw.length,
    emptyRows,
    emptyColumns,
    duplicateHeaders,
    duplicateDataRows,
    summaryRows,
    headers,
    sensitiveHeaders,
    formats,
    objects,
  };
};

const uniqueValues = (objects, header) => {
  if (!header) return new Set();
  return new Set(objects.map((row) => normalizeId(row[header])).filter(Boolean));
};

const countBy = (objects, header) => {
  const counts = new Map();
  if (!header) return counts;
  for (const row of objects) {
    const value = normalizeId(row[header]);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};

const matchSets = (leftSet, rightSet) => {
  let matched = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) matched += 1;
  }
  return {
    leftUnique: leftSet.size,
    rightUnique: rightSet.size,
    matched,
    unmatchedLeft: leftSet.size - matched,
    matchRate: leftSet.size === 0 ? null : matched / leftSet.size,
  };
};

const relationType = (leftCounts, rightCounts, matchedValues) => {
  let oneToOne = 0;
  let oneToMany = 0;
  let manyToOne = 0;
  let manyToMany = 0;
  for (const value of matchedValues) {
    const left = leftCounts.get(value) ?? 0;
    const right = rightCounts.get(value) ?? 0;
    if (left <= 1 && right <= 1) oneToOne += 1;
    else if (left <= 1 && right > 1) oneToMany += 1;
    else if (left > 1 && right <= 1) manyToOne += 1;
    else manyToMany += 1;
  }
  return { oneToOne, oneToMany, manyToOne, manyToMany };
};

const metricAvailability = (tables) => {
  const allHeaders = Object.fromEntries(
    Object.entries(tables).map(([key, table]) => [key, table.headers]),
  );

  const resolve = (tableKey, needles) => needles.find((needle) => allHeaders[tableKey]?.some((header) => header.includes(needle))) ?? null;

  const definitions = [
    ["gmv", "GMV", "businessProduct", ["支付金额", "成交金额"], "sum", "元"],
    ["gsv", "GSV", "businessProduct + afterSales", ["支付金额", "退款成功金额"], "sales_amount - refund_success_amount", "元"],
    ["refund_amount", "退款金额", "afterSales", ["退款金额", "退款成功金额", "退款申请金额"], "sum", "元"],
    ["refund_rate", "退款率", "businessProduct + afterSales", ["退款金额", "支付金额"], "refund_amount / gmv", "%"],
    ["daily_avg_gmv", "日均 GMV", "businessProduct", ["支付金额", "日期"], "gmv / days", "元/日"],
    ["visitors", "商品访客数", "businessProduct", ["商品访客数", "访客数"], "sum", "人"],
    ["page_views", "商品浏览量", "businessProduct", ["浏览量", "商品浏览量"], "sum", "次"],
    ["conversion_rate", "支付转化率", "businessProduct", ["支付转化率"], "paid_buyers / visitors", "%"],
    ["avg_order_value", "客单价", "businessProduct", ["客单价"], "sales_amount / paid_buyers", "元"],
    ["paid_buyers", "支付买家数", "businessProduct", ["支付买家数"], "sum", "人"],
    ["favorites", "收藏人数", "businessProduct", ["收藏人数", "收藏"], "sum", "人"],
    ["cart_additions", "加购人数", "businessProduct", ["加购人数", "加购"], "sum", "人"],
    ["order_buyers", "下单买家数", "businessProduct", ["下单买家数"], "sum", "人"],
    ["order_amount", "下单金额", "businessProduct", ["下单金额"], "sum", "元"],
    ["search_visitors", "搜索引导访客数", "businessProduct", ["搜索引导访客数"], "sum", "人"],
    ["search_paid_buyers", "搜索引导支付买家数", "businessProduct", ["搜索引导支付买家数"], "sum", "人"],
    ["ad_spend", "推广花费", "adProduct/adPlan", ["花费"], "sum", "元"],
    ["impressions", "展现量", "adProduct/adPlan", ["展现量"], "sum", "次"],
    ["clicks", "点击量", "adProduct/adPlan", ["点击量"], "sum", "次"],
    ["click_rate", "点击率", "adProduct/adPlan", ["点击率"], "clicks / impressions", "%"],
    ["avg_click_cost", "平均点击花费", "adProduct/adPlan", ["平均点击花费", "点击花费"], "ad_spend / clicks", "元"],
    ["cpm", "千次展现花费", "adProduct/adPlan", ["千次展现花费"], "ad_spend / impressions * 1000", "元"],
    ["ad_transaction_amount", "推广成交金额", "adProduct/adPlan", ["成交金额"], "sum", "元"],
    ["direct_transaction_amount", "直接成交金额", "adProduct/adPlan", ["直接成交金额"], "sum", "元"],
    ["indirect_transaction_amount", "间接成交金额", "adProduct/adPlan", ["间接成交金额"], "sum", "元"],
    ["direct_transaction_share", "直接成交占比", "adProduct/adPlan", ["直接成交占比"], "direct / total", "%"],
    ["indirect_transaction_share", "间接成交占比", "adProduct/adPlan", ["间接成交占比"], "indirect / total", "%"],
    ["roi", "投入产出比", "adProduct/adPlan", ["投入产出比", "ROI"], "transaction_amount / ad_spend", "倍"],
    ["ad_cost_ratio", "推广费比", "adProduct/adPlan", ["推广费比"], "ad_spend / transaction_amount", "%"],
    ["ad_cost_ratio_after_refund", "去退推广费比", "adProduct/adPlan + afterSales", ["去退推广费比"], "ad_spend / gsv", "%"],
    ["favorite_cart_count", "收藏加购数", "adProduct/adPlan", ["收藏加购数"], "sum", "次"],
    ["favorite_cart_cost", "收藏加购成本", "adProduct/adPlan", ["收藏加购成本"], "ad_spend / favorite_cart_count", "元"],
    ["guided_visitors", "引导访问人数", "adProduct/adPlan", ["引导访问人数"], "sum", "人"],
    ["guided_prospects", "引导访问潜客数", "adProduct/adPlan", ["引导访问潜客数"], "sum", "人"],
    ["guided_prospect_rate", "引导访问潜客占比", "adProduct/adPlan", ["引导访问潜客占比"], "guided_prospects / guided_visitors", "%"],
    ["deep_visits", "深度访问量", "adProduct/adPlan", ["深度访问量"], "sum", "次"],
    ["avg_pages", "平均访问页面数", "adProduct/adPlan", ["平均访问页面数"], "page_views / visitors", "页"],
    ["new_buyers", "成交新客数", "adProduct/adPlan", ["成交新客数"], "sum", "人"],
    ["new_buyer_rate", "成交新客占比", "adProduct/adPlan", ["成交新客占比"], "new_buyers / buyers", "%"],
    ["member_join_count", "入会量", "adProduct/adPlan", ["入会量"], "sum", "人"],
    ["member_join_rate", "入会率", "adProduct/adPlan", ["入会率"], "member_join_count / guided_visitors", "%"],
    ["member_first_buyers", "会员首购人数", "adProduct/adPlan", ["会员首购人数"], "sum", "人"],
    ["refund_apply_count", "退款申请数量", "afterSales", ["退款申请时间"], "count", "笔"],
    ["refund_success_count", "退款成功数量", "afterSales", ["退款完结时间", "退款成功"], "count", "笔"],
    ["refund_pending_count", "待处理退款数量", "afterSales", ["售后状态"], "count where pending", "笔"],
    ["refund_apply_amount", "退款申请金额", "afterSales", ["退款金额", "申请金额"], "sum", "元"],
    ["refund_success_amount", "退款成功金额", "afterSales", ["退款成功金额", "退款金额"], "sum success rows", "元"],
    ["refund_only_count", "仅退款数量", "afterSales", ["售后类型"], "count", "笔"],
    ["return_refund_count", "退货退款数量", "afterSales", ["售后类型"], "count", "笔"],
    ["full_refund_count", "全额退款数量", "afterSales", ["退款金额", "付款金额"], "count amount equal paid", "笔"],
    ["partial_refund_count", "部分退款数量", "afterSales", ["退款金额", "付款金额"], "count amount lower than paid", "笔"],
    ["refund_reason_distribution", "退款原因分布", "afterSales", ["退款原因"], "group count", "项"],
    ["product_refund_reason_ranking", "商品退款原因排行", "afterSales", ["商品id", "退款原因"], "group by product+reason", "项"],
    ["after_sales_status_distribution", "售后状态分布", "afterSales", ["售后状态"], "group count", "项"],
    ["customer_service_intervention", "客服介入数量", "afterSales", ["客服介入"], "count", "笔"],
    ["avg_after_sales_duration", "平均售后处理时长", "afterSales", ["退款申请时间", "退款完结时间"], "avg duration", "小时"],
    ["overdue_pending_count", "超时未处理数量", "afterSales", ["售后状态", "退款申请时间"], "count pending older than threshold", "笔"],
  ];

  return definitions.map(([field, label, source, needles, aggregation, unit]) => {
    const sourceKeys = {
      businessProduct: ["businessProduct"],
      afterSales: ["afterSales"],
      "businessProduct + afterSales": ["businessProduct", "afterSales"],
      "adProduct/adPlan": ["adProduct", "adPlan"],
      "adProduct/adPlan + afterSales": ["adProduct", "adPlan", "afterSales"],
    }[source] ?? [];
    const sourceHits = sourceKeys.map((key) => ({
      table: key,
      matchedHeader: resolve(key, needles),
    })).filter((item) => item.matchedHeader);
    return {
      field,
      label,
      source,
      matchedHeaders: sourceHits,
      rawFormat: "见对应来源表头格式审计",
      aggregation,
      formula: aggregation,
      unit,
      zeroDenominatorRule: /率|占比|比|ROI|客单价|成本/.test(label) ? "分母为 0 时返回 null，不直接平均比率" : "不适用",
      summaryRule: /率|占比|比|ROI|客单价|成本/.test(label) ? "商品/系列/店铺汇总时先汇总分子分母再重算" : "按商品/系列/店铺分组后求和或计数",
      implementable: sourceHits.length > 0,
      missing: sourceHits.length > 0 ? [] : needles,
      ambiguity: sourceHits.length > 1 ? "多个来源可能有同名/近似字段，需确认最终口径" : "",
    };
  });
};

const summarizeRelationships = (tables) => {
  const businessIdHeader = findHeader(tables.businessProduct.headers, ["商品ID", "商品id", "商品id"]);
  const adSubjectHeader = findHeader(tables.adProduct.headers, ["主体ID", "主体id"]);
  const adProductPlanHeader = findHeader(tables.adProduct.headers, ["计划ID", "计划id"]);
  const adPlanPlanHeader = findHeader(tables.adPlan.headers, ["计划ID", "计划id"]);
  const afterSalesProductHeader = findHeader(tables.afterSales.headers, ["商品id", "商品ID", "商品ID"]);
  const adProductDateHeader = findHeader(tables.adProduct.headers, ["日期", "时间"]);
  const adPlanDateHeader = findHeader(tables.adPlan.headers, ["日期", "时间"]);

  const businessIds = uniqueValues(tables.businessProduct.objects, businessIdHeader);
  const adSubjectIds = uniqueValues(tables.adProduct.objects, adSubjectHeader);
  const adProductPlans = uniqueValues(tables.adProduct.objects, adProductPlanHeader);
  const adPlanPlans = uniqueValues(tables.adPlan.objects, adPlanPlanHeader);
  const afterSalesProductIds = uniqueValues(tables.afterSales.objects, afterSalesProductHeader);

  const businessCounts = countBy(tables.businessProduct.objects, businessIdHeader);
  const adSubjectCounts = countBy(tables.adProduct.objects, adSubjectHeader);
  const adProductPlanCounts = countBy(tables.adProduct.objects, adProductPlanHeader);
  const adPlanPlanCounts = countBy(tables.adPlan.objects, adPlanPlanHeader);
  const afterSalesProductCounts = countBy(tables.afterSales.objects, afterSalesProductHeader);

  const productMatchedValues = [...businessIds].filter((value) => adSubjectIds.has(value));
  const planMatchedValues = [...adProductPlans].filter((value) => adPlanPlans.has(value));
  const afterSalesMatchedValues = [...afterSalesProductIds].filter((value) => businessIds.has(value));

  const countComposite = (objects, headers) => {
    const counts = new Map();
    if (headers.some((header) => !header)) return counts;
    for (const row of objects) {
      const key = headers.map((header) => normalizeId(row[header])).join("::");
      if (!key.replace(/:/g, "")) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };

  return {
    headers: {
      businessIdHeader,
      adSubjectHeader,
      adProductPlanHeader,
      adPlanPlanHeader,
      afterSalesProductHeader,
      adProductDateHeader,
      adPlanDateHeader,
    },
    businessProductToAdSubject: {
      ...matchSets(businessIds, adSubjectIds),
      relationType: relationType(businessCounts, adSubjectCounts, productMatchedValues),
      adRowsPerProductMax: adSubjectCounts.size ? Math.max(...adSubjectCounts.values()) : 0,
      shouldAggregateByDateAndSubject: [...countComposite(tables.adProduct.objects, [adProductDateHeader, adSubjectHeader]).values()].some((count) => count > 1),
    },
    adProductToPlan: {
      ...matchSets(adProductPlans, adPlanPlans),
      relationType: relationType(adProductPlanCounts, adPlanPlanCounts, planMatchedValues),
      productsPerPlanMax: (() => {
        const planToSubjects = new Map();
        for (const row of tables.adProduct.objects) {
          const plan = normalizeId(row[adProductPlanHeader]);
          const subject = normalizeId(row[adSubjectHeader]);
          if (!plan || !subject) continue;
          if (!planToSubjects.has(plan)) planToSubjects.set(plan, new Set());
          planToSubjects.get(plan).add(subject);
        }
        return planToSubjects.size ? Math.max(...[...planToSubjects.values()].map((set) => set.size)) : 0;
      })(),
      plansPerProductMax: (() => {
        const subjectToPlans = new Map();
        for (const row of tables.adProduct.objects) {
          const plan = normalizeId(row[adProductPlanHeader]);
          const subject = normalizeId(row[adSubjectHeader]);
          if (!plan || !subject) continue;
          if (!subjectToPlans.has(subject)) subjectToPlans.set(subject, new Set());
          subjectToPlans.get(subject).add(plan);
        }
        return subjectToPlans.size ? Math.max(...[...subjectToPlans.values()].map((set) => set.size)) : 0;
      })(),
      shouldAggregateByDateAndPlan: [...countComposite(tables.adPlan.objects, [adPlanDateHeader, adPlanPlanHeader]).values()].some((count) => count > 1),
    },
    afterSalesToBusinessProduct: {
      ...matchSets(afterSalesProductIds, businessIds),
      relationType: relationType(afterSalesProductCounts, businessCounts, afterSalesMatchedValues),
    },
  };
};

const stripObjects = (table) => {
  const rest = { ...table };
  delete rest.objects;
  return rest;
};

const main = () => {
  const tablesWithRows = Object.fromEntries(
    Object.entries(FILES).map(([key, config]) => [key, summarizeTable(key, config)]),
  );
  const relationships = summarizeRelationships(tablesWithRows);
  const metrics = metricAvailability(tablesWithRows);
  const tables = Object.fromEntries(Object.entries(tablesWithRows).map(([key, table]) => [key, stripObjects(table)]));

  const result = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    tables,
    relationships,
    metrics,
    privacy: {
      sensitiveFieldsByTable: Object.fromEntries(
        Object.entries(tables).map(([key, table]) => [key, table.sensitiveHeaders]),
      ),
      removeImmediately: [
        "订单号",
        "支付宝交易号",
        "手机号",
        "电话",
        "地址",
        "收件人",
        "物流单号",
        "操作人",
      ],
    },
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

main();
