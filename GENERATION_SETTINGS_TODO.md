# Generation Settings Redesign TODO

This document breaks the procedural generation redesign into phased, step-by-step implementation tasks.

## Goals
- Make `clusters` the default behavior.
- Fix center-starvation in clustered generation.
- Introduce cross-sector generation context for boundary-aware continuity.
- Integrate core system placement into generation flow.
- Make core selection tag-aware.
- Prepare schema for future `systemTags` and `starTags` separation.

## Success Criteria
- Home sector generation is center-anchored with controlled variance.
- Neighbor sectors show softer cluster continuity across boundaries.
- Core system selection can use tag weights and context.
- Deterministic behavior is preserved for fixed seeds.
- Existing saves/imports remain valid.

## Phase Progress + Changelog
### Phase 0 - Completed
- Added: generation metrics helpers (`js/generation-metrics.js`) and deterministic test coverage for context/cluster/core scoring.
- Changed: regression validation now includes new deterministic logic tests.
- Removed: no functional removals in this phase.

### Phase 1 - Completed
- Added: `generationSettings` schema with cluster/core tuning defaults in `data/generation-data.json` and hydration in `js/generation-data.js`.
- Changed: `starDistribution` default path switched to `clusters` across config/UI/storage fallbacks.
- Removed: no functional removals in this phase.

### Phase 2 - Completed
- Added: seed-scoped cross-sector context module (`js/generation-context.js`) with API for intent, edge pressure, core bias, neighbor summaries, and summary access.
- Changed: sector summary extractor now includes a 3x3 `densityMap`, edge occupancy vectors, core metadata, and dominant tag signals.
- Changed: context cache key now fingerprints sector record content (not only keys) to prevent stale context reuse.
- Changed: orchestration now creates context deterministically when enabled.
- Removed: no functional removals in this phase.

### Phase 3 - Completed
- Added: explicit Stage A/B/C internals in Cluster V2 (`js/generation-cluster-v2.js`) for anchor selection, iterative growth, and post-bias cleanup.
- Added: `clusterLocalNeighborCap` setting for growth-pass occupancy caps.
- Changed: Stage B now enforces local neighbor caps with controlled relaxation, keeping generation robust without stalling.
- Changed: Stage B scoring now penalizes line-like growth and boosts compact local pocket formation.
- Changed: secondary-anchor selection now targets compact group sizing around ~5-6 systems per anchor cluster when possible.
- Changed: Stage C now applies deterministic edge-balancing and final occupancy-cap enforcement after center-void protection.
- Changed: deterministic tie-break ordering tightened (score -> col -> row -> hexId).
- Changed: orchestration continues routing clustered generation through V2 behind `clusterV2Enabled` with safe fallback.
- Removed: none; legacy selector intentionally retained for rollback safety.

### Phase 4 - Completed
- Added: core-anchor-first ordering in generation orchestration so systems are generated radially from the selected core anchor candidate.
- Added: provisional auto-core selection during system generation using weighted scoring (`computeCoreSystemScore`) before POI pass.
- Changed: core generation now establishes a center-biased (not fixed-center) pre-generation origin hex, seeds clustered anchor selection from that origin, and uses it as preferred auto-core resolution.
- Changed: deep-space POI placement is decoupled from core-anchor radial influence and now uses independent deep-space weighting.
- Changed: manual core override remains authoritative when valid; non-manual core preservation now uses explicit `preferredIsAuto`.
- Changed: delete/reroll flows now reseat cores through the same resolver path with generation settings, including auto-reselect on core invalidation.
- Removed: no functional removals in this phase.

### Phase 5 - Completed
- Added: tag-aware core scoring caps/weights and optional debug score collection in `js/core-system.js`.
- Changed: core scoring now blends centrality, population, habitability, tag contributions, and context bias.
- Added: `coreScoringDebugEnabled` generation setting and orchestration logging of chosen core score breakdown in debug mode.
- Removed: no functional removals in this phase.

### Phase 6 - Completed
- Added: boundary continuity bias input from generation context into Cluster V2 scoring.
- Changed: edge-pressure blending now influences candidate placement probabilistically with seam-smoothing heuristics.
- Changed: high incoming pressure encourages near-edge continuation; low pressure discourages abrupt edge overfill.
- Changed: missing-neighbor paths still fall back to local-only behavior (`getEdgePressure` -> 0), preserving graceful degradation.
- Removed: no functional removals in this phase.

### Phase 7 - Completed
- Added: shared context-summary rebuild utility (`js/generation-context-summary.js`) for deterministic per-sector summary snapshots.
- Added: persisted `generationContextSummary` on sector records (density ratio/map, edge occupancy, core hex, dominant tags).
- Changed: context summaries now rebuild deterministically across generation, neighbor creation, sector switching, and payload load/import.
- Changed: multi-sector lifecycle paths now refresh summaries whenever `sectorsByKey` mutates.
- Changed: payload validation now sanitizes optional `generationContextSummary` shape for compatibility safety.
- Removed: duplicate helper logic cleanup by consolidating `getOrCreateSectorRecord` into `getOrCreateSectorRecordByKey`.

### Phase 8 - Completed
- Added: expanded logic and guardrail coverage for deterministic context outputs, Cluster V2 behavior, tag-aware core scoring, and boundary pressure blending.
- Added: integration/E2E checks for default `clusters` mode, core deletion auto-reselection, and seam mismatch sanity between home/neighbor sectors.
- Changed: full Playwright suite validated against the redesign changes after each phase checkpoint.
- Removed: no functional removals in this phase.

### Phase 9 - Completed
- Added: bounded context-cache validation and debug cache controls for memory-growth guardrails.
- Added: optional generation performance diagnostics (`generationPerformanceDebugEnabled`) with per-sector timing logs.
- Changed: context creation now has explicit fail-safe fallback to local-only behavior on errors.
- Changed: Cluster V2 growth pass now reuses cached edge metadata to keep per-sector complexity bounded on larger sectors.
- Changed: clustering/context paths now degrade safely to legacy behavior on failure.
- Removed: no functional removals in this phase.

### Phase 10 - Completed
- Added: staged rollout controller (`js/generation-rollout.js`) with explicit phases: `flags_off`, `home_v2`, `neighbor_context`, `full_release`, and `manual`.
- Added: `generationRolloutStage` to generation settings/schema hydration, config normalization, and payload sanitization fallbacks.
- Changed: orchestration now resolves effective per-sector flags from rollout stage before enabling Cluster V2 or cross-sector context.
- Changed: performance diagnostics now include active rollout stage and effective feature-state booleans.
- Removed: direct orchestration coupling to raw `clusterV2Enabled` / `crossSectorContextEnabled` toggles (now funneled through rollout resolver).

### Phase 11 - Completed
- Added: settings reference doc for `generationSettings` and rollout stages in `docs/generation-settings-reference.md`.
- Added: designer tuning workflow guide in `docs/generation-tuning-guide.md`.
- Added: seed determinism validation checklist in `docs/seed-determinism-checklist.md`.
- Added: edge-case tracker and follow-up backlog in `docs/generation-edge-cases.md`.
- Changed: `docs/regression-checklist.md` now explicitly gates generation changes through the seed determinism checklist.
- Removed: outdated generic Phase 11 changelog text that did not reflect concrete deliverables.

## Phase 0: Baseline, Constraints, and Safety Rails
1. Freeze baseline behavior and capture deterministic snapshots for known seeds.
2. Record current generation metrics for comparison:
   - center occupancy ratio,
   - edge occupancy ratio,
   - cluster compactness,
   - average nearest-neighbor distance,
   - boundary seam mismatch score.
3. Add a temporary feature flag strategy:
   - `clusterV2Enabled`,
   - `crossSectorContextEnabled`.
4. Define compatibility guarantees for save/load payloads.
5. Create migration notes for schema additions.

## Phase 1: Data Model and Config Foundations
1. Add generation config defaults:
   - set `starDistribution` default to `clusters`.
2. Extend generation data schema with tunable weights:
   - core tag weight table (positive/neutral/negative),
   - center-bias strength,
   - boundary continuity strength,
   - anchor jitter settings,
   - cluster growth decay settings.
3. Add schema fields for future taxonomy split:
   - `system.tags` (existing/primary),
   - `system.starTags` (future star-level tags).
4. Keep backward compatibility:
   - if fields missing, derive safe defaults.
5. Update payload validation to preserve/sanitize new fields.

## Phase 2: Generation Context (Cross-Sector Brain)
1. Create a new module for generation context (seed-scoped).
2. Define stable API surface:
   - `createGenerationContext(layoutSeed, knownSectorRecords, settings)`,
   - `getSectorIntent(sectorKey)`,
   - `getEdgePressure(sectorKey, direction)`,
   - `getCoreBias(sectorKey)`,
   - `getNeighborSummaries(sectorKey)`.
3. Add deterministic context caching per generation cycle.
4. Build sector summary extractor:
   - density map,
   - edge occupancy vectors,
   - core location metadata,
   - dominant tag signals.
5. Ensure context can run with partial data (single-sector only).

## Phase 3: Cluster V2 Algorithm (Home Sector First)
1. Replace current coordinate picker for `clusters` with staged pipeline:
   - Stage A: anchor selection,
   - Stage B: growth pass,
   - Stage C: post-bias cleanup.
2. Stage A details:
   - select primary anchor near sector center with jitter,
   - optionally select secondary anchors based on target system count.
3. Stage B details:
   - iterative candidate scoring by distance-to-anchor,
   - density decay and stochastic variance,
   - occupancy caps to avoid overpacking.
4. Stage C details:
   - apply mild edge balancing,
   - avoid dead-center void unless explicitly configured.
5. Keep deterministic ordering and tie-break rules.

## Phase 4: Core-First Integration in Generation Flow
1. Move core selection earlier in the pipeline for initial sector generation.
2. Select a core candidate from system candidates using weighted score:
   - centrality,
   - estimated population potential,
   - habitable potential,
   - strategic tag bias.
3. Grow surrounding systems/POIs with radial influence from core anchor.
4. Preserve manual override behavior:
   - user-set core stays authoritative when valid.
5. On invalidation (deleted core), auto-reselect via the same scoring path.

## Phase 5: Tag-Aware Core Scoring
1. Add configurable `coreTagWeights` table in data.
2. Implement core score terms:
   - `base + centrality + population + habitability + tagWeightSum + contextBias`.
3. Define default tag classes:
   - positive: hegemon/trade/logistics/capital-style,
   - neutral: generic exploration/science,
   - negative or zero: colony/frontier/unstable-only.
4. Add guardrails:
   - prevent a single tag from dominating all other terms,
   - cap total tag contribution.
5. Add diagnostics in debug mode:
   - show score breakdown for chosen core.

## Phase 6: Boundary Continuity Across Sectors
1. Use context edge pressure to bias new sector candidate selection.
2. For each edge direction:
   - compute incoming continuity pressure,
   - blend with internal center/core bias.
3. Ensure behavior remains probabilistic, not mirrored.
4. Add seam-smoothing heuristics:
   - encourage near-edge continuation when neighbor edge density is high,
   - discourage abrupt empty/full transitions.
5. Handle missing neighbors gracefully (fallback to local-only rules).

## Phase 7: Multi-Sector Lifecycle Integration
1. Ensure generation context is passed through:
   - home generation,
   - neighbor generation,
   - sector switching,
   - reroll operations.
2. Persist minimal context-relevant summary data in sector records.
3. Rebuild context deterministically after load/import.
4. Verify no circular dependencies between services.

## Phase 8: Testing Matrix and Validation
1. Unit tests:
   - deterministic context outputs,
   - cluster V2 scoring/tie-break behavior,
   - core score with tag-weight effects,
   - boundary pressure blending.
2. Integration tests:
   - home + neighbor generation continuity,
   - manual core override persistence,
   - deletion/reroll fallback core reselection.
3. E2E tests:
   - default clusters mode behavior,
   - center occupancy regression checks,
   - cross-sector seam quality sanity checks.
4. Regression checks:
   - save/load compatibility,
   - import/export compatibility,
   - performance budget adherence.

## Phase 9: Performance and Stability
1. Profile cluster V2 and context creation on large sectors.
2. Cache heavy intermediate computations where safe.
3. Keep per-sector generation complexity bounded.
4. Validate memory growth in expanded multi-sector mode.
5. Add fallback guard:
   - if context fails, revert to local cluster behavior.

## Phase 10: Rollout Strategy
1. Ship behind flags with defaults off.
2. Enable `clusterV2` for home sector only.
3. Evaluate metrics and deterministic snapshots.
4. Enable cross-sector continuity for neighbor generation.
5. Set `clusters` as default once acceptance criteria pass.
6. Keep legacy path temporarily for rollback.
7. Remove legacy path after stable release window.

## Phase 11: Documentation and Tuning Workflow
1. Document new settings in `data/generation-data.json` and config docs.
2. Provide a tuning guide for designers:
   - how to adjust center bias,
   - how to tune tag weights,
   - how to tune boundary continuity.
3. Add an internal checklist for validating seed determinism after each tuning pass.
4. Track known edge cases and follow-up improvements.

## Open Questions (to resolve before coding)
1. Should core-first anchoring apply to all generated sectors or only home sector?
2. Should boundary continuity be symmetric (both sectors influence each other) or source-of-truth from already-generated sectors only?
3. How strong should tag effects be relative to centrality/population terms?
4. Do we need a UI-level debug overlay for cluster anchors and core scoring during tuning?
5. When future `starTags` arrive, should they feed core scoring directly or only via derived system-level signals?

## MVP Subset (First High-Impact Slice)
This is the minimum implementation set to deliver visible quality improvements with contained risk.

### MVP Scope (In)
1. Make `clusters` the default `starDistribution`.
2. Implement a home-sector-only cluster V2 picker with center-anchor + jitter.
3. Add early core candidate selection in generation flow for home sector only.
4. Add basic tag-weight contribution for core scoring using a small default table.
5. Preserve deterministic output for fixed seeds.
6. Keep current multi-sector generation behavior unchanged except home-sector quality uplift.

### MVP Scope (Out)
1. No full cross-sector boundary continuity yet.
2. No new UI debug overlays.
3. No large schema migration for `starTags` beyond optional placeholder field support.
4. No legacy algorithm removal (keep fallback path).

### MVP Steps
1. Config switch:
   - set `clusters` as default in config/data defaults.
2. Add feature flag:
   - `clusterV2Enabled` (default on for local dev, reversible).
3. Home-sector cluster V2:
   - choose center anchor with tunable jitter,
   - grow candidate coordinates outward with deterministic scoring.
4. Core-first tie-in:
   - compute core candidate score while generating systems,
   - prefer near-center + population/habitability + basic tag weights.
5. Compatibility pass:
   - ensure save/load/import remain valid with or without new fields.
6. Tests:
   - add deterministic tests for cluster V2 coordinate selection,
   - add e2e sanity check for improved center occupancy.
7. Rollout gate:
   - compare baseline vs MVP metrics for center occupancy and cluster compactness.

### MVP Acceptance Criteria
1. Center occupancy improves versus baseline on a fixed seed set.
2. No regressions in existing e2e suite.
3. Deterministic snapshots remain stable for unchanged flags/settings.
4. Fallback to legacy cluster logic is available via feature flag.

## MVP Task Ordering by File/Module
Use this order to minimize merge risk and keep behavior verifiable at each step.

1. Defaults and settings surface
   - `js/config.js`
   - `data/config-data.json`
   - `data/generation-data.json`
   - Tasks:
     - set default `starDistribution` to `clusters`,
     - add MVP tuning knobs (`clusterV2Enabled`, anchor jitter, growth decay, basic core tag weights).

2. Cluster V2 coordinate selector (home-sector only)
   - `js/generation-spatial.js` (or new `js/generation-cluster-v2.js`)
   - `js/generation-orchestration.js`
   - Tasks:
     - implement center-anchor+jitter picker,
     - wire picker only when `clusterV2Enabled` and sector is home sector,
     - keep existing cluster selector as fallback.

3. Core-first integration during generation
   - `js/core-system.js`
   - `js/generation-orchestration.js`
   - `js/generation-system-data.js`
   - Tasks:
     - score core candidate during/after system generation pass,
     - bias around selected core anchor for remaining picks,
     - preserve manual core override when present/valid.

4. Basic tag-weight scoring inputs
   - `data/generation-data.json`
   - `js/core-system.js`
   - Tasks:
     - add initial positive/neutral/negative tag weights,
     - add score caps/normalization for tag contribution.

5. Feature-flag control and fallback safety
   - `js/generation.js`
   - `js/generation-composition.js`
   - Tasks:
     - expose/propagate `clusterV2Enabled` through deps,
     - guarantee fallback to legacy cluster path if flag off or errors occur.

6. Payload compatibility and migration safety
   - `js/sector-payload-validation.js`
   - `js/storage-payload.js`
   - `js/storage-apply.js`
   - Tasks:
     - validate/sanitize any new optional generation settings,
     - ensure old payloads load without requiring new fields.

7. Test additions and metric checks
   - `tests/unit-logic.spec.js`
   - `tests/guardrails.spec.js` and/or `tests/smoke.spec.js`
   - Tasks:
     - deterministic unit tests for cluster V2 selector,
     - e2e check for center occupancy trend,
     - regression run for full suite.

8. Rollout and default confirmation
   - `GENERATION_SETTINGS_TODO.md` (mark completed)
   - Tasks:
     - compare baseline vs MVP metrics,
     - confirm no regressions,
     - keep legacy toggle for rollback window.
