# ADR-004: IndexedDB V2 Persistence And Atomic Activation

## Status

Accepted.

## Context

V0.5A has defined the Storage V2 ownership model, dry-run migration, and real fixture readiness gate. The next step is a local browser persistence layer that can store validated V2 datasets without touching legacy localStorage keys or connecting any page to V2 yet.

## Decision

Storage V2 will use native browser IndexedDB, accessed only through Repository / Adapter contracts. Pages must not call IndexedDB directly.

This task introduces:

1. Native IndexedDB object stores for V2 records.
2. Record envelopes with `datasetId`, `recordKey`, owner fields, and immutable record value.
3. A prepare -> readback -> activate flow.
4. An activation pointer written only in the final activation transaction.
5. Activation journal entries for activated and rolled back datasets.
6. A readonly legacy snapshot reader that only reads fixed legacy keys.

Legacy localStorage remains readonly in this stage. No legacy key is deleted, rewritten, or cleared.

## Atomic Activation Rule

The migration activation flow is separated:

1. `prepare`: dry-run, validate, write all staged records and dataset metadata. No active pointer write.
2. `readback`: reload the staged dataset from IndexedDB and validate fingerprints, counts, and record keys. No active pointer write.
3. `activate`: in one final transaction, check expected current pointer, mark old active inactive, mark new dataset active, write manifest success, write pointer, and append journal.

Only a readback-validated dataset may become active.

## Boundaries

This task does not:

1. Connect any page to V2.
2. Run migration on application startup.
3. Add backend API or server database.
4. Add third-party IndexedDB libraries.
5. Add npm dependencies.
6. Modify four-source parsing, field mapping, metrics, target rules, trend rules, or legacy storage modules.

## Future Work

V0.5A-5 or a later locked task will decide runtime bootstrap, fallback behavior, and whether pages start reading from V2.
