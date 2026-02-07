# Manual Regression Checklist

Run this checklist after each refactor phase.

## Core Flow
- Open `sector_generator.html`.
- Click `Generate Sector`.
- Confirm map renders and `#statusTotalHexes` / `#statusTotalSystems` update.
- Select a populated hex and verify the right info panel updates.

## Route Planner
- Set start and end with `Pick Start` / `Pick End`.
- Verify hops/path labels update.
- Click `Clear` and verify labels reset.

## Edit Mode
- Toggle edit mode on.
- Select a body and reroll it.
- Select a body and delete it.
- Add a new body from section controls.
- Toggle edit mode off and confirm edit controls hide.

## Search
- Filter by name and star class.
- Filter by tag and min/max population.
- Click a search result and verify map selection follows.

## Persistence and IO
- `Save Local`, refresh, then `Load Local`.
- Export JSON and re-import it.
- Export SVG and PNG.
- Export GM brief.

## Multi-Sector
- Move north/south/east/west to adjacent sectors.
- Return home and verify original sector state is intact.

## Pinning and Reroll
- Pin at least one system.
- Click `Reroll Unpinned`.
- Verify pinned system remains while unpinned systems reroll.