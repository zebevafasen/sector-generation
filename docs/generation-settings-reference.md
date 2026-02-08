# Generation Settings Reference

This document describes the generation settings currently defined in `data/generation-data.json` under `generationSettings`.

## Rollout and Feature Gates
- `generationRolloutStage`:
  - `full_release`: always enable Cluster V2 and cross-sector context.
  - `flags_off`: disable Cluster V2 and cross-sector context.
  - `home_v2`: enable Cluster V2 for home sector only, context disabled.
  - `neighbor_context`: enable Cluster V2 everywhere, context only for non-home sectors.
  - `manual`: use raw booleans below.
- `clusterV2Enabled`:
  - Raw manual toggle for Cluster V2.
  - Used directly only when `generationRolloutStage` is `manual`.
- `crossSectorContextEnabled`:
  - Raw manual toggle for cross-sector context.
  - Used directly only when `generationRolloutStage` is `manual`.

## Cluster Distribution Tuning
- `centerBiasStrength`:
  - Strength of center preference during clustered placement.
  - Higher values pull systems toward center.
- `boundaryContinuityStrength`:
  - Strength of neighbor-edge pressure influence.
  - Higher values increase cross-sector seam continuity.
- `clusterAnchorJitter`:
  - Offset variance for cluster anchor placement.
  - Higher values spread clusters away from perfect center.
- `clusterGrowthDecay`:
  - Controls outward growth decay in cluster expansion.
  - Lower values produce tighter clusters.
- `clusterLocalNeighborCap`:
  - Soft cap for local occupancy density in growth pass.
- `clusterSecondaryAnchorThreshold`:
  - Minimum target systems before secondary anchor behavior is considered.
- `clusterEdgeBalance`:
  - Controls post-pass edge balancing strength.
- `clusterCenterVoidProtection`:
  - Protects against empty center regions after growth.

## Core Scoring and Diagnostics
- `coreScoringDebugEnabled`:
  - Emits debug score-breakdown logs for chosen core system.
- `generationPerformanceDebugEnabled`:
  - Emits generation timing and mode diagnostics per sector.
- `coreTagWeights`:
  - Per-tag scoring adjustments used in core selection.
- `coreTagContributionCap`:
  - Max total contribution from tag scoring terms.
- `coreTagPerTagCap`:
  - Max contribution from a single tag class.
- `coreScoreWeights`:
  - Weights for score terms: `base`, `centrality`, `population`, `habitability`, `context`.

## Persistence and Compatibility
- These settings are normalized in `js/generation-config.js`.
- They are hydrated from defaults in `js/generation-data.js`.
- They are sanitized for saved/imported payloads in `js/sector-payload-validation.js`.
