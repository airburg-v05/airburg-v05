# handoff

Current state:

- Local implementation and validation are complete.
- Deployment is blocked only by the remote SSH gate.
- No remote mutation ran in this task.

Resume from here:

1. Sign in to Alibaba Cloud in the preserved Chrome handoff tab. Do not send credentials through Codex.
2. Reuse the evidence-backed recovery from `ECS_OUT_OF_BAND_SSH_RECOVERY_AND_RESUME_V2_HOME_PREVIEW_DEPLOY_V1`: verify the current legitimate management source and update only the single-source TCP 22 security-group rule. Do not open SSH to all sources.
3. Re-run the SSH BatchMode gate against `root@123.57.49.121` three times with spacing.
4. If SSH recovers, continue the existing deploy protocol in order:
   - rsync with exclusions
   - remote `npm ci`
   - remote `npm run build`
   - PM2 restart / status check for `airburg-tmall-v1`
   - `nginx -t` and active-status check
   - confirm `127.0.0.1:3000` only
   - confirm public `:3000` unreachable
   - public route regression
   - public `/upload -> /v2/home` validation in the authorized browser path
5. Keep `humanAccepted=false` and `PENDING_POST_DEPLOY_OWNER_REVIEW`.

Do not redo locally unless the code changes again:

- `validate-tmall-plan-level-ad-plan-regression-v1`: already PASS
- `validate-tianmao-v1-refactor-pipeline-v2`: already PASS
- `validate-tmall-real-data-metric-reconciliation-v1`: already PASS
- `validate-v2-home-upload18-system-chrome-local-v1`: already PASS
- `npm run build`: already PASS

Blocking evidence to preserve:

- SSH BatchMode output: `Connection closed by 123.57.49.121 port 22`

Reason this task is not complete:

- Owner authorized deployment, but the actual remote entry gate is outside local code control and did not open in this run.
