# Generation Tuning Guide

This guide is for designers tuning clustered generation behavior.

## Workflow
1. Pick a fixed seed set before tuning.
2. Change one setting group at a time.
3. Run the determinism checklist in `docs/seed-determinism-checklist.md`.
4. Record before/after notes and keep the final setting change small.

## Center Bias Tuning
- Primary knobs:
  - `centerBiasStrength`
  - `clusterAnchorJitter`
  - `clusterCenterVoidProtection`
- If center feels too empty:
  - increase `centerBiasStrength` by small increments (`+0.1` to `+0.2`),
  - increase `clusterCenterVoidProtection` slightly.
- If center feels too packed:
  - reduce `centerBiasStrength`,
  - increase `clusterAnchorJitter` slightly to spread anchor choices.

## Tag Weight Tuning (Core Selection)
- Primary knobs:
  - `coreTagWeights`
  - `coreTagContributionCap`
  - `coreTagPerTagCap`
  - `coreScoreWeights.context`
- Recommendations:
  - keep per-tag values moderate (usually within `-8` to `+8`),
  - avoid raising caps unless the current caps are clearly clipping intended effects,
  - validate with `coreScoringDebugEnabled` on before finalizing values.

## Boundary Continuity Tuning
- Primary knobs:
  - `boundaryContinuityStrength`
  - `clusterEdgeBalance`
- If seams feel disconnected:
  - increase `boundaryContinuityStrength` slightly,
  - optionally raise `clusterEdgeBalance` a little.
- If seams look mirrored or over-forced:
  - reduce `boundaryContinuityStrength`,
  - keep edge balance low and let local cluster structure dominate.

## Rollout-Safe Tuning
- Use `generationRolloutStage` to isolate changes:
  - `home_v2` for home-sector-only verification.
  - `neighbor_context` for neighbor continuity checks.
  - `manual` only when explicitly comparing raw feature toggles.
- Use `full_release` only after the deterministic and regression checks pass.
