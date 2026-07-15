# ECS Out-of-Band SSH Recovery And V2 Home Preview Deployment

## Result

`PASS`. SSH BatchMode was recovered through an evidence-backed Alibaba Cloud security-group correction, and the exact validated deployment commit `a293db7e75b14853d68d9711e131cc348d2f3ea0` now serves `/v2/home` as a public preview. This is not visual or human acceptance.

## GPT Plan Audit

The proposed recovery direction was correct with five necessary refinements: do not infer `MaxStartups` from a closed connection, do not treat `ssh-keyscan` as authentication proof, do not advance deployment state before public regression, back up SSH files only immediately before an actual edit, and discover the instance's real connection capabilities instead of assuming Session Manager exists.

## Out-of-Band Diagnosis

- Instance: `i-2ze2arwqe6zubsf1ogco`, `cn-beijing`, Ubuntu 22.04.5 LTS.
- Workbench supplied the trusted root command channel.
- Session Management was unavailable; VNC was available but unnecessary.
- `sshd` was active, configuration-valid, listening on port 22, and not near its startup limit.
- Disk, inode, memory, failed-service, host-firewall, and security-agent checks did not indicate exhaustion or a guest-OS block.
- The controlled direct attempt did not reach `sshd` logs.

The confirmed root cause was `ALIYUN_SECURITY_CONTROL`: SSH ingress was limited to an obsolete single-address source. The current legitimate management source was proven by correlating a unique direct HTTP probe with Nginx access logs, without recording the address in Git.

## Minimum Recovery

One priority-one security-group rule was added for TCP 22 and only the verified current management source as a single-address rule. SSH configuration files were not edited, so no SSH backup, config diff, service reload, or service restart was applicable. `MaxStartups` remained `50:30:200`; Fail2ban, sshguard, and host-firewall state were unchanged; the ECS was not rebooted.

`sshd -t` passed. Three external BatchMode connections, separated by at least five seconds, received the server banner, completed public-key authentication, and executed the remote identity check.

## Exact Deployment

- Deployment source: exact `git archive` of `a293db7e75b14853d68d9711e131cc348d2f3ea0`.
- SHA-256: `8790c30cadcc7579cfdfe205d70e1e383b1e30ead30dd67045fdda5d9e2747b8`.
- Files: `769`; forbidden package files: `0`.
- Release: `/opt/airburg/releases/v2-home-a293db7-20260715T1915`.
- Code rollback point: `/opt/airburg/ecommerce-platform-optimized`.
- PM2 rollback snapshot: `/opt/airburg/rollback/airburg-tmall-v1-pre-v2-home-20260715T1915.pm2.json`.
- Remote `npm ci` and `npm run build`: PASS.
- PM2 `airburg-tmall-v1`: online, zero restarts at final check.
- Nginx: active; config test PASS.
- Node server: `127.0.0.1:3000` only; public port 3000 remains unusable.

## Public Regression

All seven legacy V1 routes remain HTTP 200 without replacing or redirecting `/home`. The historical V1 visual validator completed its 1440px and 390px browser checks with zero business console errors, no page-wide overflow, and no forbidden text; its process exit was nonzero only because one source-only assertion still expects the literal token `productId-first`. That stale assertion is recorded as validator debt, not hidden as a runtime pass.

All nine V2 routes return HTTP 200. Only `/v2/home` is data-bound; the other eight remain `STATIC_SHELL_ROUTE_200`.

The public browser-only 18-file regression passed: `17 success / 0 failed / 1 safe skipped`, active dataset save/refresh/reopen restore, duplicate-import idempotence, 17 KPI, time and comparison controls, MTD/DLY, metric settings, operating settings, tooltip, 1440px, and 390px. Reconciled totals remain GMV `125596`, GSV `85455.96`, visitors `143076`, paid buyers `128`, ad spend `7625.95`, clicks `6692`, and refund `29602.18`; missing metrics remain `13.65%` and `63.4%`.

Public screenshot manifest:

`/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-public-preview-20260715-17qerU/manifest.json`

## Current Gate

- `previewDeployed = true`
- `visualAccepted = false`
- `humanAccepted = false`
- `visualReviewStatus = PENDING_HUMAN_REVIEW`
- `humanReviewRequired = true`

Stop here. The only next gate is the user's public `/v2/home` visual review. Do not data-bind another V2 page and do not replace legacy `/home`.
