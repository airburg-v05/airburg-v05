import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type FindingBucket =
  | "HARD_BLOCK"
  | "NEEDS_REVIEW"
  | "ALLOW_SAFE_CONTEXT"
  | "FORBIDDEN_PATH"
  | "REAL_SECRET"
  | "REAL_SAMPLE"
  | "OLD_PERSISTENCE_COPY";

type ScanStatus = "PASS" | "NEEDS_REVIEW" | "BLOCKED" | "FAIL";

interface Finding {
  bucket: FindingBucket;
  category: string;
  file: string;
  line?: number;
  context: string;
}

interface ScanResult {
  status: ScanStatus;
  changedFilesCount: number;
  hardBlockFindings: Finding[];
  needsReviewFindings: Finding[];
  allowedSafeContextFindings: Finding[];
  forbiddenPathFindings: Finding[];
  realSecretFindings: Finding[];
  realSampleFindings: Finding[];
  oldPersistenceCopyFindings: Finding[];
  summary: {
    hardBlockCount: number;
    needsReviewCount: number;
    allowedSafeContextCount: number;
  };
}

const ROOT = process.cwd();

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const changedFiles = (): string[] => {
  const modified = git(["diff", "--name-only"])
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  return unique([...modified, ...untracked]).sort();
};

const gitStatusPaths = (): string[] =>
  git(["status", "--porcelain"])
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((file) => (file.includes(" -> ") ? file.split(" -> ").at(-1) ?? file : file));

const pushFinding = (
  target: Finding[],
  bucket: FindingBucket,
  category: string,
  file: string,
  context: string,
  line?: number,
) => {
  const exists = target.some(
    (finding) =>
      finding.bucket === bucket &&
      finding.category === category &&
      finding.file === file &&
      finding.context === context &&
      finding.line === line,
  );
  if (!exists) target.push({ bucket, category, file, line, context });
};

const isDocsFile = (file: string): boolean => file === "AGENTS.md" || file.startsWith("docs/");
const isAgentOrSkillDoc = (file: string): boolean =>
  file === "AGENTS.md" || file.startsWith("docs/agents/") || file.startsWith("docs/skills/");
const isProtocolDoc = (file: string): boolean =>
  file === "docs/PROJECT_CURRENT_STATE.md" ||
  file === "docs/PAGE_PROBLEM_MATRIX_V2.md" ||
  file === "docs/TASK_EXECUTION_PROTOCOL_V1.md" ||
  file === "docs/UI_BASELINE_LOCK_V2.md";
const isTaskContractGuardrail = (file: string, line: string, category: string): boolean =>
  category === "raw_file_path" &&
  /^docs\/project\/tasks\/[^/]+\/task-contract\.json$/.test(file) &&
  /^"private-samples\/\*\*",?$/.test(line.trim());
const isAuditFile = (file: string): boolean => file.startsWith("scripts/private-audit/");
const isComponentFile = (file: string): boolean => file.startsWith("components/");
const isAppFile = (file: string): boolean => file.startsWith("app/");
const isEtlFile = (file: string): boolean => file.startsWith("lib/etl/");
const isBiFile = (file: string): boolean => file.startsWith("lib/bi/");
const isPersistenceFile = (file: string): boolean => file.startsWith("lib/persistence/");
const isRuntimeCodeFile = (file: string): boolean =>
  isAppFile(file) || isComponentFile(file) || isEtlFile(file) || isBiFile(file) || isPersistenceFile(file);

const safetyWords = [
  "禁止",
  "不得",
  "不保存",
  "不会保存",
  "不展示",
  "不输出",
  "不包含",
  "不进入",
  "拒绝",
  "过滤",
  "黑名单",
  "敏感",
  "安全",
  "negative",
  "forbidden",
  "sensitive",
  "banned",
  "deny",
  "block",
  "must not",
  "do not",
  "not save",
  "not expose",
];

const isSafetyExplanationLine = (line: string): boolean =>
  safetyWords.some((word) => line.toLowerCase().includes(word.toLowerCase()));

const isAuditRuleLine = (line: string): boolean =>
  /forbidden|sensitive|banned|negative|assert|block|deny|scan|secret|token|password|private[_ -]?key|rawRows|previewRows/i.test(
    line,
  ) || /禁止|敏感|黑名单|负向|不应出现|不保存|不展示|校验|扫描|规则/.test(line);

const isPersistenceRejectListLine = (line: string): boolean =>
  /forbidden|deny|reject|containsForbidden|safeString|sensitive|rawRows|previewRows|fileName|warning 原文|订单号|退款编号|交易号|电话|地址|物流|买家说明|商家备注|操作人|子账号|stack/i.test(
    line,
  );

const isEtlSafeFilterLine = (line: string): boolean =>
  /售后|退款|物流|电话|地址|敏感|safe|filter|aggregate|字段|识别|丢弃|不保存|不输出/.test(line);

const isUploadExtensionLine = (line: string): boolean => /\.xls|\.xlsx|\.csv|Excel|CSV/i.test(line);

const isParserLocalRawRowsLine = (file: string, line: string): boolean =>
  file === "lib/etl/parse-excel.ts" && /\brawRows\b/.test(line);

const isOldPersistenceCopyAllowed = (line: string): boolean =>
  /(不保存|不会保存|不展示|不输出).*(原始|Excel|CSV|文件|rawRows|previewRows|warning 原文|敏感|明细|售后)/.test(line);

const highConfidenceSecretPatterns = [
  { category: "aliyun_access_key_id", pattern: /\bLTAI[0-9A-Za-z]{12,}\b|\bAKIA[0-9A-Z]{16}\b/ },
  {
    category: "access_key_secret_assignment",
    pattern: /\b(?:access[_-]?key[_-]?secret|aliyun[_-]?sk|secret[_-]?key)\b\s*[:=]\s*["'`][^"'`]{8,}["'`]/i,
  },
  { category: "token_assignment", pattern: /\btoken\b\s*[:=]\s*["'`][^"'`]{8,}["'`]/i },
  { category: "password_assignment", pattern: /\b(?:password|passwd|root\s*密码)\b\s*[:=]\s*["'`][^"'`]{4,}["'`]/i },
  { category: "ssh_private_key_body", pattern: /-----BEGIN (?:OPENSSH|RSA|EC|DSA)? ?PRIVATE KEY-----/ },
];

const sensitiveTokenPatterns = [
  { category: "rawRows", pattern: /\brawRows\b/ },
  { category: "previewRows", pattern: /\bpreviewRows\b/ },
  { category: "warning_original", pattern: /warning 原文|raw warnings?/i },
  { category: "after_sales_order_id", pattern: /订单号|售后订单号/ },
  { category: "refund_id", pattern: /退款编号/ },
  { category: "transaction_id", pattern: /交易号|支付宝交易号/ },
  { category: "phone", pattern: /电话|手机号/ },
  { category: "address", pattern: /地址/ },
  { category: "logistics", pattern: /物流信息|物流单号|物流/ },
  { category: "buyer_note", pattern: /买家说明/ },
  { category: "merchant_remark_original", pattern: /商家备注原文|商家备注明细/ },
  { category: "operator", pattern: /操作人|审核操作人|退款操作人/ },
  { category: "subaccount", pattern: /子账号/ },
  { category: "technical_stack", pattern: /技术错误堆栈|\bstack trace\b|\bstack\b/i },
  { category: "raw_file_path", pattern: /\/Users\/zongji\/Desktop\/每日平台数据\/天猫|private-samples/i },
  { category: "excel_csv_extension_or_name", pattern: /(?:[\w\u4e00-\u9fa5【】._-]+)?\.(?:xls|xlsx|csv)\b/i },
  { category: "private_key_scan_term", pattern: /BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY|private key/i },
  { category: "token_scan_term", pattern: /\btoken\b/i },
  { category: "password_scan_term", pattern: /\bpassword\b|root\s*密码/i },
];

const oldPersistenceCopyPatterns = [
  { category: "old_copy_refresh_not_retained", pattern: /刷新页面后不会保留/ },
  { category: "old_copy_page_temporary", pattern: /仅当前页面临时生效|当前仅页面内临时生效|仅当前页面临时维护/ },
  { category: "old_copy_no_local_storage", pattern: /不写入本地存储|数据不写入本地存储/ },
  { category: "old_copy_memory_only", pattern: /识别和导入只在当前浏览器内存中进行|只在当前浏览器内存中进行/ },
  { category: "old_copy_no_save_ambiguous", pattern: /不会保存/ },
];

const forbiddenPathPatterns = [
  { category: "private_samples_in_git", pattern: /^private-samples(?:\/|$)/ },
  { category: "vercel_in_git", pattern: /^\.vercel(?:\/|$)|^vercel\.json$/ },
  { category: "node_modules_in_git", pattern: /^node_modules(?:\/|$)/ },
  { category: "next_in_git", pattern: /^\.next(?:\/|$)/ },
  { category: "tsbuildinfo_in_git", pattern: /(^|\/)tsconfig\.tsbuildinfo$/ },
  { category: "package_changed", pattern: /^package(?:-lock)?\.json$/ },
  { category: "storage_changed", pattern: /^lib\/storage(?:\/|$)/ },
  { category: "tmall_changed", pattern: /^lib\/tmall(?:\/|$)/ },
  { category: "v05_changed", pattern: /^lib\/v05(?:\/|$)/ },
  { category: "temp_path_in_git", pattern: /^\/tmp\/|^\/var\/folders\// },
  { category: "screenshot_artifact_in_git", pattern: /(^|\/)(screenshots?|playwright-report|test-results)(\/|$)/ },
  { category: "debug_log_in_git", pattern: /(^|\/)(npm-debug\.log|yarn-error\.log|pnpm-debug\.log)$/ },
  { category: "coverage_in_git", pattern: /^coverage(?:\/|$)/ },
];

const realSamplePathPattern = /\.(?:xls|xlsx|csv)$/i;
const privateKeyFilePathPattern = /\.(?:pem|key)$/i;

const classifySecretHit = (
  file: string,
  line: string,
  category: string,
  lineNumber: number,
  realSecretFindings: Finding[],
  allowedSafeContextFindings: Finding[],
) => {
  if ((isDocsFile(file) && isSafetyExplanationLine(line)) || (isAuditFile(file) && isAuditRuleLine(line))) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "secret_pattern_documented_as_guardrail", lineNumber);
    return;
  }

  pushFinding(realSecretFindings, "REAL_SECRET", category, file, "high_confidence_secret", lineNumber);
};

const classifySensitiveToken = (
  file: string,
  line: string,
  category: string,
  lineNumber: number,
  hardBlockFindings: Finding[],
  needsReviewFindings: Finding[],
  allowedSafeContextFindings: Finding[],
) => {
  if (isAgentOrSkillDoc(file)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "agent_skill_guardrail_text", lineNumber);
    return;
  }

  if (isProtocolDoc(file)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "project_protocol_guardrail_text", lineNumber);
    return;
  }

  if (isTaskContractGuardrail(file, line, category)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "task_contract_forbidden_path_glob", lineNumber);
    return;
  }

  if (isDocsFile(file)) {
    if (isSafetyExplanationLine(line)) {
      pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "docs_safety_explanation", lineNumber);
      return;
    }
    pushFinding(needsReviewFindings, "NEEDS_REVIEW", category, file, "docs_non_runtime_sensitive_term", lineNumber);
    return;
  }

  if (isAuditFile(file)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "private_audit_negative_assertion_or_scan_rule", lineNumber);
    return;
  }

  if (isPersistenceFile(file) && isPersistenceRejectListLine(line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "persistence_reject_blocklist", lineNumber);
    return;
  }

  if (isEtlFile(file) && isEtlSafeFilterLine(line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "etl_safe_field_detection_or_filter", lineNumber);
    return;
  }

  if (isParserLocalRawRowsLine(file, line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "parser_local_rows_not_persisted", lineNumber);
    return;
  }

  if (isUploadExtensionLine(line) && (isComponentFile(file) || isEtlFile(file))) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "upload_accept_or_extension_check", lineNumber);
    return;
  }

  if (isRuntimeCodeFile(file) && isSafetyExplanationLine(line)) {
    pushFinding(needsReviewFindings, "NEEDS_REVIEW", category, file, "runtime_negative_safety_copy", lineNumber);
    return;
  }

  if (category === "token_scan_term" || category === "password_scan_term" || category === "private_key_scan_term") {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "scan_term_non_secret_context", lineNumber);
    return;
  }

  pushFinding(hardBlockFindings, "HARD_BLOCK", category, file, "runtime_or_persistence_sensitive_usage", lineNumber);
};

const scanChangedContent = (files: string[]) => {
  const hardBlockFindings: Finding[] = [];
  const needsReviewFindings: Finding[] = [];
  const allowedSafeContextFindings: Finding[] = [];
  const realSecretFindings: Finding[] = [];
  const oldPersistenceCopyFindings: Finding[] = [];

  files.forEach((file) => {
    const absolutePath = path.join(ROOT, file);
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) return;

    let source = "";
    try {
      source = fs.readFileSync(absolutePath, "utf8");
    } catch {
      return;
    }

    source.split(/\r?\n/).forEach((line, index) => {
      const lineNumber = index + 1;

      highConfidenceSecretPatterns.forEach(({ category, pattern }) => {
        if (pattern.test(line)) {
          classifySecretHit(file, line, category, lineNumber, realSecretFindings, allowedSafeContextFindings);
        }
      });

      sensitiveTokenPatterns.forEach(({ category, pattern }) => {
        if (pattern.test(line)) {
          classifySensitiveToken(
            file,
            line,
            category,
            lineNumber,
            hardBlockFindings,
            needsReviewFindings,
            allowedSafeContextFindings,
          );
        }
      });

      if (!isDocsFile(file) && !isAuditFile(file) && isRuntimeCodeFile(file)) {
        oldPersistenceCopyPatterns.forEach(({ category, pattern }) => {
          if (pattern.test(line) && !isOldPersistenceCopyAllowed(line)) {
            pushFinding(
              oldPersistenceCopyFindings,
              "OLD_PERSISTENCE_COPY",
              category,
              file,
              "runtime_copy_needs_context_review",
              lineNumber,
            );
          }
        });
      }
    });
  });

  return {
    hardBlockFindings,
    needsReviewFindings,
    allowedSafeContextFindings,
    realSecretFindings,
    oldPersistenceCopyFindings,
  };
};

const scanPaths = (files: string[], statusPaths: string[]) => {
  const forbiddenPathFindings: Finding[] = [];
  const realSampleFindings: Finding[] = [];
  const allPaths = unique([...files, ...statusPaths]);

  allPaths.forEach((file) => {
    forbiddenPathPatterns.forEach(({ category, pattern }) => {
      if (pattern.test(file)) {
        pushFinding(forbiddenPathFindings, "FORBIDDEN_PATH", category, file, "git_status_path");
      }
    });

    if (realSamplePathPattern.test(file)) {
      pushFinding(realSampleFindings, "REAL_SAMPLE", "real_excel_csv_file_in_git", file, "git_status_path");
    }

    if (privateKeyFilePathPattern.test(file)) {
      pushFinding(forbiddenPathFindings, "FORBIDDEN_PATH", "private_key_file_in_git", file, "git_status_path");
    }
  });

  return { forbiddenPathFindings, realSampleFindings };
};

const deriveStatus = (result: Omit<ScanResult, "status" | "summary">): ScanStatus => {
  if (
    result.hardBlockFindings.length > 0 ||
    result.forbiddenPathFindings.length > 0 ||
    result.realSecretFindings.length > 0 ||
    result.realSampleFindings.length > 0
  ) {
    return "BLOCKED";
  }

  if (result.oldPersistenceCopyFindings.length > 0 || result.needsReviewFindings.length > 0) {
    return "NEEDS_REVIEW";
  }

  return "PASS";
};

const main = (): ScanResult => {
  const files = changedFiles();
  const statusPaths = gitStatusPaths();
  const pathFindings = scanPaths(files, statusPaths);
  const contentFindings = scanChangedContent(files);
  const partial = {
    changedFilesCount: files.length,
    hardBlockFindings: contentFindings.hardBlockFindings,
    needsReviewFindings: contentFindings.needsReviewFindings,
    allowedSafeContextFindings: contentFindings.allowedSafeContextFindings,
    forbiddenPathFindings: pathFindings.forbiddenPathFindings,
    realSecretFindings: contentFindings.realSecretFindings,
    realSampleFindings: pathFindings.realSampleFindings,
    oldPersistenceCopyFindings: contentFindings.oldPersistenceCopyFindings,
  };
  const status = deriveStatus(partial);

  return {
    status,
    ...partial,
    summary: {
      hardBlockCount:
        partial.hardBlockFindings.length +
        partial.forbiddenPathFindings.length +
        partial.realSecretFindings.length +
        partial.realSampleFindings.length,
      needsReviewCount: partial.needsReviewFindings.length + partial.oldPersistenceCopyFindings.length,
      allowedSafeContextCount: partial.allowedSafeContextFindings.length,
    },
  };
};

try {
  const result = main();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "BLOCKED" || result.status === "FAIL") {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
