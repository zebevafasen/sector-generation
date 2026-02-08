# Seed Determinism Checklist

Run this checklist after every tuning pass that changes generation settings.

## Setup
1. Use a fixed seed list (at least 5 seeds).
2. Use the same grid size and density profile for both runs.
3. Disable unrelated local edits before comparison.

## Determinism Validation
1. Generate each seed twice with identical settings.
2. Confirm system placement and core selection are identical per seed.
3. Confirm deep-space POI placement is identical per seed.
4. Confirm neighbor generation for the same movement sequence is identical.

## Regression Validation
1. Run `npm run lint`.
2. Run `npx playwright test tests/unit-logic.spec.js`.
3. Run `npx playwright test`.

## Review and Sign-off
1. Record changed settings and exact values.
2. Record any expected metric shifts (center occupancy, seam mismatch, compactness).
3. Record any anomalies in `docs/generation-edge-cases.md`.
4. Do not merge tuning changes unless deterministic checks pass.
