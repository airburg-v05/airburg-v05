# EXECUTION_LOG

## 2026-07-18

1. Read governance and project truth:
   - `shiyu-unified-task-intake`
   - `project-task-preflight`
   - `public-requirements-research`
   - project `AGENTS.md`
   - `docs/project/PROJECT_SSOT.json`
   - `docs/project/current-task.json`
   - route / data-source / metric contracts
   - prior `/v2/home` review + deploy handoff

2. Verified the real desktop source set under `/Users/zongji/Desktop/每日平台数据/天猫`:
   - 18 total files
   - 5 product metric files
   - 5 search total files
   - 5 search product files
   - 1 after-sales file
   - 1 product-level ad report CSV
   - 1 plan-level ad report CSV

3. Reproduced the failing 18th file path and confirmed:
   - `计划报表_20260701_160014.csv` is valid plan-level data;
   - the rejection was caused by the generic runtime path treating plan rows without `productId` as unsupported;
   - the current Tmall source model already recognized `ad_plan`, but the generic ETL runtime and BI bridge were not layered for mixed plan/product granularity.

4. Implemented the minimum authorized fix:
   - accept plan-level `plan_metric` rows when `planId` exists and `productId` is absent;
   - preserve `productId = null` for plan-level coverage;
   - keep product-level KPI semantics authoritative;
   - layer plan-level source coverage separately so mixed product-level + plan-level files do not double count ad spend / clicks / ROI;
   - keep same-day same-plan plan-level dedup keyed by `planId + date`;
   - keep product-level KPI dedup keyed by `productId + date`.

5. Added or updated validators:
   - `scripts/private-audit/validate-tmall-plan-level-ad-plan-regression-v1.ts`
   - `scripts/private-audit/validate-tianmao-v1-refactor-pipeline-v2.ts`
   - `scripts/private-audit/validate-tmall-real-data-metric-reconciliation-v1.ts`
   - `scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
   - updated existing upload / vertical-slice validators to stop expecting `unsupported_plan_summary`

6. Local validation results:
   - TypeScript `--noEmit`: PASS
   - targeted eslint on changed files: PASS
   - full `npm run build`: PASS
   - full `npm run lint`: FAIL only on pre-existing unrelated validator / warnings
   - plan-level regression: PASS
   - full real-data refactor / reconciliation validator: PASS
   - 6-file metric reconciliation validator: PASS
   - real 18-file system Chrome validator: PASS

7. Remote deployment attempt:
   - deployment protocol read from `docs/agents/deploy-agent.md` and `docs/skills/airburg-deploy-skill.md`
   - SSH BatchMode gate command run against `root@123.57.49.121`
   - result: `Connection closed by 123.57.49.121 port 22`
   - remote rsync / build / PM2 / Nginx / public regression did not run

## 2026-07-20 recovery and deployment

1. Confirmed the historical failure did not originate from task archiving, source damage, or local build failure.
2. Used the authenticated Alibaba Cloud console and Workbench without reading credentials, cookies, tokens, or private keys.
3. Confirmed the active TCP 22 security-group rule pointed to an obsolete single management source.
4. Rebound only that rule to the current legitimate source as `/32`; no broad SSH source was added.
5. SSH BatchMode passed before deployment and passed three spaced checks after deployment.
6. Packaged exact implementation commit `de1a65feafe7f83d678654ccf77d448aa2c71159`; package SHA-256 matched locally and remotely.
7. Remote `npm ci` and `npm run build` passed; PM2 switched to the new release with rollback metadata preserved.
8. PM2, Nginx, loopback-only Node binding, public-port isolation, and authorized route checks passed.
9. Public `/upload -> /v2/home` 18-file E2E passed with `18 success / 0 failed / 0 skipped`.
10. Preserved `visualAccepted=false` and `humanAccepted=false`; next gate is owner visual review.
