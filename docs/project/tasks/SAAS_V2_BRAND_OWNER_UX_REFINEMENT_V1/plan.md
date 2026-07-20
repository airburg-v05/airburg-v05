# Plan

Status: `PUBLIC_E2E_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW`

1. Preflight and archive setup — `completed`
   - Read required skills, project SSOT/current state and previous handoff.
   - Create this task archive and gate manifest.

2. Source audit — `completed`
   - Inspect shared V2 layout, nav, page headers, board empty states, home KPI card, upload/data-health/history, target-center, search-assets and exclusion-rules.
   - Identify shared component changes before route-local edits.

3. UX implementation — `completed`
   - Collapse repeated secondary hero/header.
   - Add compact board empty state and home no-target target state.
   - Hide exclusion rules from main nav and simplify direct route.
   - Simplify upload, data-health/history and target copy.
   - Refactor search modal to focused one-group editing with fixed footer.

4. Validators — `completed`
   - Add brand UX validator.
   - Update existing validators if they intentionally encoded now-replaced user-facing internal text.

5. Local validation — `completed`
   - Targeted validators, changed-file lint, repo lint, build.
   - System Chrome isolated-profile 18+4+target.
   - System Chrome ten-route desktop/mobile and key UX clicks.

6. Deploy — `completed`
   - Clean implementation commit.
   - Existing Aliyun release flow with safe rsync exclusions and rollback metadata.

7. Public regression and cleanup — `completed`
   - Public isolated-profile ten-route desktop/mobile and key-click validation.
   - Public 18+4+target regression if affected validators require it.
   - Cleanup test runtime/debug state in isolated profile only.
   - PM2/Nginx/loopback/public :3000/log delta checks.

8. Evidence and handoff — `completed`
   - Update SSOT/current-task/validation/result/handoff.
   - Evidence commit.
   - Confirm clean worktree.

9. Board empty-state CTA increment — `completed`
   - Add one `前往数据接入` CTA to `/v2/series-board`, `/v2/store-board`, and `/v2/product-board` compact empty states.
   - Validate by brand UX validator, changed-file lint, build, local production three-route browser check, public HTTP check, public desktop/390px mobile browser check, and service/log delta.
   - Keep prior 18+4+target PASS evidence; do not rerun data E2E for a pure link-only increment.
