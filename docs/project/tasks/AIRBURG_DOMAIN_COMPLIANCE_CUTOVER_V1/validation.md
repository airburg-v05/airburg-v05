# Validation

Status: PUBLIC_HTTPS_11_OF_11_PASS_PENDING_OWNER_REVIEW_AND_MPS_LOGIN

- `git diff --check`: PASS.
- ESLint: PASS with 0 errors and 2 pre-existing warnings.
- Local production build: PASS, 27 routes.
- Local V2 footer regression: 11/11 PASS.
- Remote production build: PASS, 27 routes.
- Root-domain HTTPS V2 footer regression: 11/11 PASS.
- `www` HTTPS home and footer: PASS.
- Root and `www` HTTP to HTTPS redirects: PASS.
- Certificate hostnames and validity: PASS; expires 2026-10-20.
- Certbot renewal dry run: PASS; timer active/enabled.
- Nginx config test: PASS.
- PM2 `airburg-tmall-v1`: online; process cwd matches the active release.
- Node binding: `127.0.0.1:3000`.

The earlier 55/55 interaction and data regression remains the business-function evidence. This task validates only the incremental domain, TLS and filing-footer layer. Owner visual/business review and public-security filing remain open.
