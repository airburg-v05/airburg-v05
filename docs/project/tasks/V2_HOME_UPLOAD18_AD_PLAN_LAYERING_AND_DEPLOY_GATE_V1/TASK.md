# TASK

- Task ID: `V2_HOME_UPLOAD18_AD_PLAN_LAYERING_AND_DEPLOY_GATE_V1`
- Primary owner: `ecommerce-platform-optimized`
- Scope: `/upload` + `/v2/home` only, plus the minimum shared parsing / runtime / persistence / validator changes required for the historical 18-file Tmall acceptance path.
- Direct owner authorization:
  - visual direction is accepted for implementation;
  - continue through deployment for the authorized slice only;
  - reproduce and fix the single failing 18th file without changing metric semantics;
  - product truth, final human acceptance, and unrelated modules remain gated.

- Current outcome:
  - local implementation PASS;
  - 18/18 local browser upload PASS;
  - plan-level and product-level ad sources are layered without KPI double count;
  - deployment is blocked at the remote SSH BatchMode gate.
