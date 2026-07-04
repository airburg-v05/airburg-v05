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

type RecommendedStatus = "PASS" | "NEEDS_REVIEW" | "NEEDS_COPY_FIX" | "BLOCKED";

interface Finding {
  bucket: FindingBucket;
  category: string;
  file: string;
  line?: number;
  context: string;
}

interface ScanResult {
  status: "PASS";
  changedFilesCount: number;
  hardBlockFindings: Finding[];
  needsReviewFindings: Finding[];
  allowedSafeContextFindings: Finding[];
  forbiddenPathFindings: Finding[];
  realSecretFindings: Finding[];
  realSampleFindings: Finding[];
  oldPersistenceCopyFindings: Finding[];
  recommendedStatus: RecommendedStatus;
}

const ROOT = process.cwd();

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const changedFiles = (): string[] => {
  const modified = git(["diff", "--name-only"])
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const untracked = git(["ls-files", "-o", "--exclude-standard"])
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
  const existing = target.find(
    (finding) =>
      finding.bucket === bucket &&
      finding.category === category &&
      finding.file === file &&
      finding.context === context,
  );
  if (existing) return;
  target.push({ bucket, category, file, line, context });
};

const isAuditFile = (file: string): boolean => file.startsWith("scripts/private-audit/");
const isRuntimeFile = (file: string): boolean =>
  file.startsWith("app/") || file.startsWith("components/") || file.startsWith("lib/");
const isPersistenceFile = (file: string): boolean => file.startsWith("lib/persistence/");
const isEtlFileRouter = (file: string): boolean => file === "lib/etl/runtime/file-router.ts";
const isUploadComponent = (file: string): boolean => file.startsWith("components/upload/");

const safeNegativeCopyTerms = [
  "不保存",
  "不会保存",
  "不展示",
  "不输出",
  "不包含",
  "禁止",
  "不得",
  "拒绝",
  "过滤",
  "安全",
  "敏感",
];

const isSafeNegativeCopyLine = (line: string): boolean =>
  safeNegativeCopyTerms.some((term) => line.includes(term));

const lineLooksLikeAuditRule = (line: string): boolean =>
  /forbidden|sensitive|banned|negative|deny|block|secret|token|password|private key|rawRows|previewRows/i.test(line) ||
  /禁止|敏感|黑名单|负向|不应出现|不保存|不展示/.test(line);

const lineLooksLikePersistenceBlocklist = (line: string): boolean =>
  /forbiddenTextTokens|containsForbiddenToken|safeString|rawRows|previewRows|fileName|warning 原文|订单号|退款编号|交易号|电话|地址|物流|买家说明|商家备注|操作人|子账号|technical stack|stack trace/.test(
    line,
  );

const lineLooksLikeParserLocalVariable = (file: string, line: string): boolean =>
  file === "lib/etl/parse-excel.ts" && /\brawRows\b/.test(line);

const lineLooksLikeUploadAccept = (file: string, line: string): boolean =>
  isUploadComponent(file) && /accept=("|')\.xls,\.xlsx,\.csv("|')/.test(line);

const lineLooksLikeExtensionCheck = (file: string, line: string): boolean =>
  file.startsWith("lib/etl/") && /\\\.\(?x?lsx?\|csv|\.csv|\.xlsx|\.xls/i.test(line);

const lineLooksLikePrivateAuditLocalSamplePath = (file: string, line: string): boolean =>
  isAuditFile(file) && (/\/Users\/zongji\/Desktop\/每日平台数据\/天猫/.test(line) || /private-samples/.test(line));

const isSafeNoSaveRawCopy = (line: string): boolean =>
  /不会保存|不保存/.test(line) &&
  /原始|Excel|CSV|文件|rawRows|previewRows|warning 原文|敏感|明细|售后/.test(line);

const oldPersistenceCopyPatterns = [
  { category: "old_copy_refresh_not_retained", pattern: /刷新页面后不会保留/ },
  { category: "old_copy_page_temporary", pattern: /仅当前页面临时生效|当前仅页面内临时生效|仅当前页面临时维护/ },
  { category: "old_copy_no_local_storage", pattern: /不写入本地存储|数据不写入本地存储/ },
  { category: "old_copy_memory_only", pattern: /识别和导入只在当前浏览器内存中进行|只在当前浏览器内存中进行/ },
  { category: "old_copy_no_save_ambiguous", pattern: /不会保存/ },
];

const secretPatterns = [
  { category: "aliyun_access_key_id", pattern: /\bLTAI[0-9A-Za-z]{12,}\b|\bAKIA[0-9A-Z]{16}\b/ },
  {
    category: "access_key_secret_assignment",
    pattern: /\b(?:access[_-]?key[_-]?secret|aliyun[_-]?sk|secret[_-]?key)\b\s*[:=]\s*["'][^"']{8,}["']/i,
  },
  { category: "token_assignment", pattern: /\btoken\b\s*[:=]\s*["'][^"']{8,}["']/i },
  { category: "password_assignment", pattern: /\b(?:password|passwd|root\s*密码)\b\s*[:=]?\s*["'][^"']{4,}["']/i },
  {
    category: "ssh_private_key_body",
    pattern: /-----BEGIN (?:OPENSSH|RSA|EC|DSA)? ?PRIVATE KEY-----/,
  },
];

const sensitiveTokenPatterns = [
  { category: "rawRows", pattern: /\brawRows\b/ },
  { category: "previewRows", pattern: /\bpreviewRows\b/ },
  { category: "warning_original", pattern: /warning 原文|raw warnings?/i },
  { category: "after_sales_order_id", pattern: /订单号/ },
  { category: "refund_id", pattern: /退款编号/ },
  { category: "transaction_id", pattern: /交易号/ },
  { category: "phone", pattern: /电话/ },
  { category: "address", pattern: /地址/ },
  { category: "logistics", pattern: /物流信息|物流/ },
  { category: "buyer_note", pattern: /买家说明/ },
  { category: "merchant_remark_original", pattern: /商家备注原文|商家备注明细/ },
  { category: "operator", pattern: /操作人/ },
  { category: "subaccount", pattern: /子账号/ },
  { category: "technical_stack", pattern: /\bstack\b|技术错误堆栈/i },
  { category: "raw_file_path", pattern: /\/Users\/zongji\/Desktop\/每日平台数据\/天猫|private-samples/i },
  { category: "excel_csv_extension_or_name", pattern: /(?:[\w\u4e00-\u9fa5【】._-]+)?\.(?:xls|xlsx|csv)\b/i },
  { category: "private_key_scan_term", pattern: /BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY|private key/i },
  { category: "token_scan_term", pattern: /\btoken\b/i },
  { category: "password_scan_term", pattern: /\bpassword\b|root\s*密码/i },
];

const forbiddenPathPatterns = [
  { category: "private_samples_in_git", pattern: /^private-samples(?:\/|$)/ },
  { category: "vercel_in_git", pattern: /^\.vercel(?:\/|$)|^vercel\.json$/ },
  { category: "node_modules_in_git", pattern: /^node_modules(?:\/|$)/ },
  { category: "next_cache_in_git", pattern: /^\.next\/cache(?:\/|$)/ },
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
  needsReviewFindings: Finding[],
) => {
  if (isAuditFile(file) && lineLooksLikeAuditRule(line)) {
    pushFinding(needsReviewFindings, "NEEDS_REVIEW", category, file, "audit_scan_rule", lineNumber);
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
  if (isAuditFile(file)) {
    if (lineLooksLikePrivateAuditLocalSamplePath(file, line)) {
      pushFinding(needsReviewFindings, "NEEDS_REVIEW", category, file, "private_audit_local_sample_path_or_forbidden_path_rule", lineNumber);
      return;
    }
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "private_audit_negative_assertion", lineNumber);
    return;
  }

  if (
    (category === "token_scan_term" || category === "password_scan_term" || category === "private_key_scan_term") &&
    !lineLooksLikeAuditRule(line)
  ) {
    return;
  }

  if (isEtlFileRouter(file)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "etl_field_routing_for_safe_aggregation", lineNumber);
    return;
  }

  if (isPersistenceFile(file) && lineLooksLikePersistenceBlocklist(line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "persistence_reject_blocklist", lineNumber);
    return;
  }

  if (lineLooksLikeParserLocalVariable(file, line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "parser_local_variable_not_persisted", lineNumber);
    return;
  }

  if (lineLooksLikeUploadAccept(file, line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "upload_accept_extension_list", lineNumber);
    return;
  }

  if (lineLooksLikeExtensionCheck(file, line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "etl_extension_check", lineNumber);
    return;
  }

  if (isRuntimeFile(file) && isSafeNegativeCopyLine(line)) {
    pushFinding(allowedSafeContextFindings, "ALLOW_SAFE_CONTEXT", category, file, "runtime_negative_safety_copy", lineNumber);
    return;
  }

  if (category === "token_scan_term" || category === "password_scan_term" || category === "private_key_scan_term") {
    pushFinding(needsReviewFindings, "NEEDS_REVIEW", category, file, "scan_term_non_secret_context", lineNumber);
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

    const source = fs.readFileSync(absolutePath, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      const lineNumber = index + 1;

      secretPatterns.forEach(({ category, pattern }) => {
        if (pattern.test(line)) {
          classifySecretHit(file, line, category, lineNumber, realSecretFindings, needsReviewFindings);
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

      if (!isAuditFile(file) && isRuntimeFile(file)) {
        oldPersistenceCopyPatterns.forEach(({ category, pattern }) => {
          if (pattern.test(line) && !isSafeNoSaveRawCopy(line)) {
            pushFinding(
              oldPersistenceCopyFindings,
              "OLD_PERSISTENCE_COPY",
              category,
              file,
              "runtime_copy_needs_update",
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

const recommendedStatus = (
  hardBlockFindings: Finding[],
  forbiddenPathFindings: Finding[],
  realSecretFindings: Finding[],
  realSampleFindings: Finding[],
  oldPersistenceCopyFindings: Finding[],
  needsReviewFindings: Finding[],
): RecommendedStatus => {
  if (
    hardBlockFindings.length > 0 ||
    forbiddenPathFindings.length > 0 ||
    realSecretFindings.length > 0 ||
    realSampleFindings.length > 0
  ) {
    return "BLOCKED";
  }
  if (oldPersistenceCopyFindings.length > 0) return "NEEDS_COPY_FIX";
  if (needsReviewFindings.length > 0) return "NEEDS_REVIEW";
  return "PASS";
};

const main = (): ScanResult => {
  const files = changedFiles();
  const statusPaths = gitStatusPaths();
  const pathFindings = scanPaths(files, statusPaths);
  const contentFindings = scanChangedContent(files);
  const status = recommendedStatus(
    contentFindings.hardBlockFindings,
    pathFindings.forbiddenPathFindings,
    contentFindings.realSecretFindings,
    pathFindings.realSampleFindings,
    contentFindings.oldPersistenceCopyFindings,
    contentFindings.needsReviewFindings,
  );

  return {
    status: "PASS",
    changedFilesCount: files.length,
    hardBlockFindings: contentFindings.hardBlockFindings,
    needsReviewFindings: contentFindings.needsReviewFindings,
    allowedSafeContextFindings: contentFindings.allowedSafeContextFindings,
    forbiddenPathFindings: pathFindings.forbiddenPathFindings,
    realSecretFindings: contentFindings.realSecretFindings,
    realSampleFindings: pathFindings.realSampleFindings,
    oldPersistenceCopyFindings: contentFindings.oldPersistenceCopyFindings,
    recommendedStatus: status,
  };
};

try {
  const result = main();
  console.log(JSON.stringify(result, null, 2));
  if (result.recommendedStatus === "BLOCKED" || result.recommendedStatus === "NEEDS_COPY_FIX") {
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
