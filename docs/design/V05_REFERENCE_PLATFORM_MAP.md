# V0.5 Reference Platform Map

## Purpose

This file records platform support direction without pretending that platform-specific screenshots, APIs, or official export contracts are already implemented.

## Platform Codes

1. `tmall`: Tmall.
2. `jd`: JD.
3. `pdd`: Pinduoduo.
4. `douyin`: Douyin ecommerce.
5. `youzan`: Youzan.

## Current Reality

Only the existing Tmall local four-source workflow is implemented today. Other platforms are product direction, not implemented functionality.

## Future Platform Import Requirements

Each platform must define:

1. platform code.
2. source type list.
3. field dictionary.
4. parser and validator.
5. safe aggregate facts.
6. data quality warnings.
7. unsupported metrics.
8. after-sales privacy treatment.

## Visual Reference Boundary

No complete reference screenshots have been supplied for V0.5. Therefore:

1. Do not copy external platform UI.
2. Do not create platform-branded visuals.
3. Do not infer final design from memory.
4. Use the project design system until references are provided.

## Metric Comparability

Cross-platform dashboards must mark non-comparable metrics clearly. Do not force one platform's metric definition onto another platform.
