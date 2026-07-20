# Plan

Status: `IN_PROGRESS`

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

6. Deploy — `pending`
   - Clean implementation commit.
   - Existing Aliyun release flow with safe rsync exclusions and rollback metadata.

7. Public regression and cleanup — `pending`
   - Public isolated-profile ten-route desktop/mobile and key-click validation.
   - Public 18+4+target regression if affected validators require it.
   - Cleanup test runtime/debug state in isolated profile only.
   - PM2/Nginx/loopback/public :3000/log delta checks.

8. Evidence and handoff — `pending`
   - Update SSOT/current-task/validation/result/handoff.
   - Evidence commit.
   - Confirm clean worktree.
