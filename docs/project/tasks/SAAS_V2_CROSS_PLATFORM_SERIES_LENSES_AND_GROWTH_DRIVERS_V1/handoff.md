# Handoff

Status: PUBLIC_E2E_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW

The cross-platform series version is public at `http://123.57.49.121/v2/home`. Exact implementation commit `dface84eefdd87a55c819fd323626efb436b19b2` is active from immutable release `/opt/airburg/releases/saas-v2-cross-platform-series-dface84-20260722T092433`; isolated public browser regression passed 52/52.

The prior owner-approved stable visual baseline remains recoverable through tag `stable/saas-v2-commercial-refinement-20260722`, implementation `e25660c67539bc82405e00e4f354df855e82e05c`, preserved release `/opt/airburg/releases/saas-v2-commercial-refinement-e25660c-20260722T003453`, and the new pre-switch PM2 snapshot.

Next action: Zongji checks the public page on another computer. Until that review, keep `visualAccepted=false` and `humanAccepted=false` for the new version; technical PASS must not be promoted to business acceptance. No push or merge was performed.
