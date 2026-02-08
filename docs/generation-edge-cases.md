# Generation Edge Cases and Follow-ups

This file tracks known edge cases discovered during tuning and rollout.

## Current Known Edge Cases
- Context unavailability fallback:
  - Behavior: context creation can fail and fall back to local-only cluster behavior.
  - Status: handled by fallback in orchestration.
  - Follow-up: add optional surfaced UI debug indicator when fallback occurs.
- Rollout stage mismatch during manual experiments:
  - Behavior: changing raw booleans has no effect unless `generationRolloutStage` is `manual`.
  - Status: expected behavior.
  - Follow-up: add UI hint in future settings panel work.
- Very small sector dimensions:
  - Behavior: continuity and anchor effects are naturally constrained on tiny maps.
  - Status: expected; bounded by size and occupancy caps.
  - Follow-up: evaluate if tiny-sector presets need dedicated defaults.

## Deferred Improvements
- Add visual debug overlays for:
  - cluster anchors,
  - edge-pressure heat,
  - core score breakdown by hex.
- Expand deterministic snapshot tooling for automated seed-baseline diffs.
- Revisit legacy path removal after stable release window closes.

## Tracking Notes
- Date: 2026-02-08
- Branch: `feat/generation-settings-redesign`
- Owner: generation settings redesign effort
