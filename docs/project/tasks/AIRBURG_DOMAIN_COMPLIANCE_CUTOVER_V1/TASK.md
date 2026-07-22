# Airburg Domain Compliance Cutover V1

Status: PUBLIC_HTTPS_11_OF_11_PASS_PENDING_OWNER_REVIEW_AND_MPS_LOGIN

## Scope

- Preserve business implementation `8c95d8154d463d17216dae14efc74a4b5a800ed4`.
- Add the approved ICP filing number and official MIIT link to the shared V2 shell.
- Enable HTTPS for the registered root and `www` domains.
- Deploy an immutable release and validate all eleven V2 routes.

## Excluded

- JD or Douyin data adapters.
- Server-side accounts, tenancy or cross-device data synchronization.
- Public-security filing login, CAPTCHA or final submission without a separate owner action.
- Visual or business acceptance inferred from technical checks.

## Acceptance

- Root and `www` certificates are valid and HTTP redirects to HTTPS.
- All eleven V2 routes return successfully and contain the ICP footer.
- Nginx is config-valid, PM2 is online and Node remains loopback-only.
- Previous release, Nginx config and PM2 state remain recoverable.
