# Open Source UI Template License Audit For Airburg SaaS V2

Task: `AIRBURG_SAAS_UI_V2_AUTONOMOUS_PLUGIN_INSTALL_AND_DESIGN_PACKAGE_V1`

Status: `LOCAL_AUDIT_PACKAGE`

Audit date: 2026-07-07

## Rules

- GPL templates are visual reference only and must not be copied into this commercial SaaS codebase.
- Commercial or unclear-license websites must not be source-copied.
- No dependency may be added without user confirmation.
- `package.json` must not be modified in this stage.
- This document is a planning audit, not a final template selection.

## Candidate Audit

### 1. shadcn/ui blocks

- templateName: `shadcn/ui blocks`
- sourceUrl: `https://ui.shadcn.com/blocks` and `https://github.com/shadcn-ui/ui`
- license: `MIT`
- licenseEvidence: GitHub repository reports MIT license; shadcn block docs invite block contributions and describe dashboard-scale blocks.
- commercialUseAllowed: yes
- codeCopyAllowed: yes, with MIT notice preservation
- dependenciesRequired: likely existing React/Tailwind/shadcn dependencies; exact dependency delta requires later template selection confirmation
- suitablePages: `/v2/home`, `/v2/series-board`, `/v2/store-board`, `/v2/product-board`, `/v2/target-center`, `/v2/search-assets`, `/v2/exclusion-rules`
- strengths: code ownership, copy-and-adapt model, strong fit for current Next.js/Tailwind direction
- risks: block composition still needs product design decisions; not a complete analytics product by itself
- recommendation: `use_code`

### 2. Tremor

- templateName: `Tremor`
- sourceUrl: `https://github.com/tremorlabs/tremor` and `https://www.tremor.so/`
- license: `Apache-2.0`
- licenseEvidence: GitHub repository reports Apache-2.0 license and describes React components for charts and dashboards.
- commercialUseAllowed: yes
- codeCopyAllowed: yes, with Apache-2.0 notice obligations
- dependenciesRequired: Tailwind CSS, Radix UI, chart-related Tremor dependencies if adopted; requires user confirmation before package changes
- suitablePages: `/v2/home`, `/v2/series-board`, `/v2/store-board`, `/v2/product-board`, `/v2/data-health`
- strengths: analytics-first cards, chart, table, and dashboard patterns
- risks: adding Tremor as a dependency may duplicate existing visual-system logic; needs package review
- recommendation: `needs_user_review`

### 3. TailAdmin React

- templateName: `TailAdmin React`
- sourceUrl: `https://github.com/TailAdmin/free-react-tailwind-admin-dashboard`
- license: `MIT`
- licenseEvidence: GitHub repository and LICENSE.md report MIT license; README describes React 19, TypeScript, and Tailwind CSS v4 admin dashboard.
- commercialUseAllowed: yes
- codeCopyAllowed: yes, with MIT notice preservation
- dependenciesRequired: React/Tailwind/Vite-oriented template dependencies; exact delta requires user confirmation
- suitablePages: `/v2/upload`, `/v2/data-health`, `/v2/target-center`, `/v2/exclusion-rules`
- strengths: complete admin shell examples, sidebar, tables, charts, forms, dark mode
- risks: Vite-first patterns may require adaptation to Next.js App Router; can feel generic if copied too directly
- recommendation: `visual_reference_only`

### 4. Flowbite React Admin Dashboard

- templateName: `Flowbite React Admin Dashboard`
- sourceUrl: `https://github.com/themesberg/flowbite-react-admin-dashboard`
- license: `MIT`
- licenseEvidence: GitHub repository and LICENSE report MIT; README states code can be copied or used as a whole for a website.
- commercialUseAllowed: yes
- codeCopyAllowed: yes, with MIT notice preservation
- dependenciesRequired: Flowbite, Flowbite React, ApexCharts, Tailwind integration if adopted; requires user confirmation before package changes
- suitablePages: `/v2/upload`, `/v2/data-health`, `/v2/search-assets`, `/v2/exclusion-rules`
- strengths: mature admin patterns, tables, drawers, modals, task-heavy workflows
- risks: Flowbite dependency could pull the project away from shadcn-style ownership; use carefully
- recommendation: `visual_reference_only`

### 5. shadcn-admin

- templateName: `shadcn-admin`
- sourceUrl: `https://github.com/satnaing/shadcn-admin`
- license: `MIT`
- licenseEvidence: GitHub repository reports MIT license and states Admin Dashboard UI crafted with Shadcn and Vite.
- commercialUseAllowed: yes
- codeCopyAllowed: yes, with MIT notice preservation
- dependenciesRequired: Vite/shadcn dashboard stack; exact delta requires user confirmation
- suitablePages: `/v2/home`, `/v2/series-board`, `/v2/store-board`, `/v2/product-board`
- strengths: close visual and component family match to shadcn-based SaaS dashboards
- risks: Vite structure is not a direct Next.js route template; must adapt rather than wholesale copy
- recommendation: `use_code`

### 6. Material Tailwind Dashboard React

- templateName: `Material Tailwind Dashboard React`
- sourceUrl: `https://github.com/creativetimofficial/material-tailwind-dashboard-react`
- license: `MIT`
- licenseEvidence: GitHub repository reports MIT license and describes a Tailwind CSS and React admin dashboard.
- commercialUseAllowed: yes
- codeCopyAllowed: yes, with MIT notice preservation
- dependenciesRequired: `@material-tailwind/react`, ApexCharts, and related template dependencies if adopted; requires user confirmation before package changes
- suitablePages: `/v2/home`, `/v2/data-health`, `/v2/target-center`
- strengths: polished card, nav, and chart examples with strong visual density
- risks: Material visual language may conflict with the quieter Airburg operational dashboard style
- recommendation: `visual_reference_only`

### 7. GPL visual reference case: Chingu Admin Dashboard

- templateName: `GPL visual reference case - Chingu Admin Dashboard`
- sourceUrl: `https://github.com/chingu-x/chingu-admin-dashboard`
- license: `GPL-3.0`
- licenseEvidence: GitHub repository reports GPL-3.0 license.
- commercialUseAllowed: unclear for closed-source SaaS code copy because GPL copyleft obligations apply
- codeCopyAllowed: no for this project stage
- dependenciesRequired: not evaluated because code must not be copied
- suitablePages: visual comparison only for dense admin dashboard anti-patterns
- strengths: simple administrative dashboard structure can be visually studied
- risks: GPL code copying can contaminate closed/commercial code obligations
- recommendation: `visual_reference_only`

## Shortlist Recommendation

Primary recommended path:

```text
shadcn/ui blocks + selective shadcn-admin layout adaptation + Tremor-inspired chart/card semantics
```

Do not add Tremor, Flowbite, or Material Tailwind dependencies until a later user-confirmed template selection task.

Rejected for direct code:

```text
GPL visual reference case - Chingu Admin Dashboard
```

Reason:

```text
Do not copy GPL code into Airburg SaaS V2.
```
