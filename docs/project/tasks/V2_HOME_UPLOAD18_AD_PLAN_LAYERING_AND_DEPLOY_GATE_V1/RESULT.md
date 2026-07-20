# RESULT

Status: `PUBLIC_E2E_PASS_PENDING_HUMAN_REVIEW`

What is complete:

- The historical 18-file Tmall upload set is accepted locally through the real browser `/upload` path.
- The previously failing plan-level report is now accepted as plan-level coverage, not rejected.
- Product-level and plan-level ad sources are explicitly layered:
  - product-level ad rows remain the authoritative KPI source for store / product aggregation when present;
  - plan-level rows are retained for source coverage and plan-level semantics;
  - mixed-granularity input no longer double counts ad spend / clicks / ROI.
- `/v2/home` local browser verification passes after upload, refresh, and mobile viewport checks.

Deployment completion:

- Root cause confirmed: the TCP 22 security-group rule still pointed to an obsolete single management source.
- Only that rule was rebound to the current legitimate source as `/32`; SSH was not opened to all sources.
- Three spaced post-deploy BatchMode checks passed.
- Exact implementation commit `de1a65feafe7f83d678654ccf77d448aa2c71159` was packaged, built, and deployed to the existing ECS preview.
- PM2 is online, Nginx configuration is valid, Node remains loopback-only on `127.0.0.1:3000`, and public port `3000` remains unreachable.
- All authorized legacy and V2 preview routes returned HTTP 200.
- Public `/upload -> /v2/home` real 18-file E2E passed: `18 success / 0 failed / 0 skipped`.

What is not complete:

- `visualAccepted=false` and `humanAccepted=false` remain unchanged.
- The next gate is the owner's public `/v2/home` visual review; technical and browser PASS do not replace that review.
