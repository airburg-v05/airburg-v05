# RESULT

Status: `LOCAL_PASS_REMOTE_DEPLOY_BLOCKED`

What is complete:

- The historical 18-file Tmall upload set is accepted locally through the real browser `/upload` path.
- The previously failing plan-level report is now accepted as plan-level coverage, not rejected.
- Product-level and plan-level ad sources are explicitly layered:
  - product-level ad rows remain the authoritative KPI source for store / product aggregation when present;
  - plan-level rows are retained for source coverage and plan-level semantics;
  - mixed-granularity input no longer double counts ad spend / clicks / ROI.
- `/v2/home` local browser verification passes after upload, refresh, and mobile viewport checks.

What is not complete:

- The authorized deployment did not reach rsync / remote build / PM2 / Nginx because the ECS SSH BatchMode gate failed before authentication.
- The previous successful recovery task proves the same symptom was caused by an Alibaba Cloud security-group rule bound to an obsolete single management address. The current recurrence is therefore `LIKELY_RECURRENT_ALIYUN_SECURITY_CONTROL`, but remains pending current console confirmation.
- Chrome was opened to the Alibaba Cloud ECS console and stopped at the official login page. No credential, cookie, password, token, or private key was read. No cloud setting was changed.

Deployment blocker:

- `ssh -o BatchMode=yes -o ConnectTimeout=10 root@123.57.49.121 true`
- Output: `Connection closed by 123.57.49.121 port 22`
