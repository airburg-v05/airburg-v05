# Plugin Availability Report For Airburg SaaS V2

Report marker: `PLUGIN_AVAILABILITY_REPORT`

Task: `AIRBURG_SAAS_UI_V2_AUTONOMOUS_PLUGIN_INSTALL_AND_DESIGN_PACKAGE_V1`

Status: `template_first_fallback`

Branch checked: `feature/saas-ui-v2-shell`

## Scope

This report records plugin discovery and safe fallback decisions for the Airburg SaaS UI V2 design package stage.

This stage does not:

- modify business code
- create `/v2` routes
- add dependencies
- deploy
- run `git add`, `git commit`, or `git push`

## Discovery Method

- `tool_search`: checked callable tools for Product Design, Build Web Apps, Vercel, Canva, and Figma.
- `list_available_plugins_to_install`: checked installable official/trusted plugin candidates.
- `request_plugin_install`: not called because Product Design, Build Web Apps, and Vercel did not appear as exact install candidates. Canva and Figma were visible, but the task says they are not Product Design substitutes and require user authorization before use.

## Plugin Matrix

| pluginName | installed | enabled | available | installationAttempted | canUseForPrototype | canUseForImplementation | canUseForPreviewDeploy | requiresExternalAuth | authStatus | recommendedUsage | risk | decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| Product Design plugin | false | false | false | true | false | false | false | false | no exact plugin candidate exposed | Use only if later exposed as an official/trusted Codex plugin. | Cannot generate Product Design-native prototype artifacts in this session. Ordinary Codex must not substitute itself as Product Design. | `PRODUCT_DESIGN_PLUGIN_UNAVAILABLE_AFTER_INSTALL_ATTEMPT`; enter template-first fallback. |
| Build Web Apps plugin | false | false | false | true | false | false | false | false | no exact plugin candidate exposed | Use only after confirmed prototype and template choice in a later implementation task. | Current task forbids implementation and `/v2` route creation. | unavailable; no install performed. |
| Vercel plugin | false | false | false | true | false | false | false | false | no exact plugin candidate exposed | Use only after explicit preview deploy authorization. | Current task forbids deploy; Vercel cannot replace ECS process. | unavailable; no install performed. |
| Canva integration / plugin | false | false | false | false | false | false | false | true | visible install candidate, not authorized for this task | Optional prototype carrier only after user authorization. | Could accidentally become a Product Design substitute if used without approval. | `CANVA_OR_FIGMA_AVAILABLE_NEEDS_USER_AUTHORIZATION`; not installed or used. |
| Figma integration / plugin | false | false | false | false | false | false | false | true | visible install candidate, not authorized for this task | Optional prototype carrier only after user authorization. | Could accidentally become a Product Design substitute if used without approval. | `CANVA_OR_FIGMA_AVAILABLE_NEEDS_USER_AUTHORIZATION`; not installed or used. |

## Result

Product Design, Build Web Apps, and Vercel were not available as exact callable tools or exact install candidates in this Codex session. Canva and Figma were visible as install candidates, but they are not authorized substitutes for Product Design in this task.

Recommended design path:

```text
template_first_fallback
```

Next user confirmation token:

```text
APPROVE_DESIGN_PACKAGE_V2
```
