const { test, expect } = require('@playwright/test');

test.describe('pure logic modules', () => {
  test('utils parseHexId, bounds, and sorting behave as expected', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const mod = await import('/js/utils.js');
      return {
        parsedValid: mod.parseHexId('3-7'),
        parsedInvalid: mod.parseHexId('foo'),
        inBounds: mod.isHexIdInBounds('2-2', 4, 4),
        outOfBounds: mod.isHexIdInBounds('4-0', 4, 4),
        sorted: mod.sortHexIds(['2-1', '0-2', 'bad', '0-1'])
      };
    });

    expect(result.parsedValid).toEqual({ col: 3, row: 7 });
    expect(result.parsedInvalid).toBeNull();
    expect(result.inBounds).toBeTruthy();
    expect(result.outOfBounds).toBeFalsy();
    expect(result.sorted).toEqual(['0-1', '0-2', '2-1', 'bad']);
  });

  test('utils pickWeighted and seeded RNG are deterministic', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const mod = await import('/js/utils.js');
      const picked = mod.pickWeighted(
        [
          { label: 'A', weight: 0 },
          { label: 'B', weight: 2 },
          { label: 'C', weight: 5 }
        ],
        () => 0.2
      );

      const hashSeed = mod.xmur3('same-seed')();
      const r1 = mod.mulberry32(hashSeed);
      const r2 = mod.mulberry32(hashSeed);
      const seq1 = [r1(), r1(), r1()];
      const seq2 = [r2(), r2(), r2()];

      return {
        picked: picked ? picked.label : null,
        seq1,
        seq2
      };
    });

    expect(result.picked).toBe('B');
    expect(result.seq1).toEqual(result.seq2);
  });

  test('body classification applies canonical normalization and counting', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const mod = await import('/js/body-classification.js');
      const counts = mod.countSystemBodies({
        planets: [
          { type: 'Lava' },
          { type: 'Debris Field' },
          { type: 'Artificial' },
          { type: 'Terrestrial' }
        ]
      });

      return {
        normalized: mod.normalizeBodyType('Lava'),
        isPlanetaryLava: mod.isPlanetaryBodyType('Lava'),
        isBelt: mod.isBeltOrFieldBodyType('Debris Field'),
        isArtificial: mod.isArtificialBodyType('Artificial'),
        counts
      };
    });

    expect(result.normalized).toBe('Volcanic');
    expect(result.isPlanetaryLava).toBeTruthy();
    expect(result.isBelt).toBeTruthy();
    expect(result.isArtificial).toBeTruthy();
    expect(result.counts).toEqual({ planets: 2, belts: 1, stations: 1 });
  });

  test('planet environment defaults are stable and unknown types fall back safely', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const mod = await import('/js/planet-environment.js');
      return {
        terrestrialDefault: mod.getDefaultPlanetEnvironment('Terrestrial'),
        unknownDefault: mod.getDefaultPlanetEnvironment('Mystery World')
      };
    });

    expect(result.terrestrialDefault).toEqual({
      atmosphere: 'Breathable',
      temperature: 'Temperate'
    });
    expect(result.unknownDefault).toEqual({
      atmosphere: 'Unknown',
      temperature: 'Unknown'
    });
  });

  test('sector payload validator rejects invalid shapes and sanitizes valid payloads', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const mod = await import('/js/sector-payload-validation.js');

      const invalid = mod.validateSectorPayload({ dimensions: { width: 8, height: 10 }, sectors: [] });
      const valid = mod.validateSectorPayload({
        dimensions: { width: 3, height: 3 },
        sectors: {
          '0-0': { name: 'Alpha', planets: [{ type: 'Terrestrial' }, { type: '' }, null] },
          '99-99': { name: 'OutOfBounds', planets: [] }
        },
        deepSpacePois: {
          '0-1': { name: 'Relay Beacon 101', kind: 'Navigation', summary: 'safe lane marker', risk: 'Low', rewardHint: 'route aid' },
          '1-1': { name: 'Active Jump-Gate 123', kind: 'Navigation', summary: 'legacy named gate', risk: 'Low', rewardHint: 'legacy naming only' },
          '1-2': { name: 'Stateful Active', kind: 'Navigation', jumpGateState: 'active' },
          '2-2': { name: 'Stateful Inactive', kind: 'Navigation', jumpGateState: 'inactive' },
          '0-0': { name: 'Should Drop', kind: 'Hazard' },
          '99-99': { name: 'Also Drop', kind: 'Mystery' }
        },
        selectedHexId: '99-99',
        pinnedHexIds: ['0-0', '99-99'],
        manualRange: { min: 12, max: 2 }
      });

      return {
        invalidOk: invalid.ok,
        validOk: valid.ok,
        validWarning: valid.warning,
        validSectors: valid.ok ? Object.keys(valid.payload.sectors) : [],
        validSelectedHexId: valid.ok ? valid.payload.selectedHexId : null,
        validPinnedHexIds: valid.ok ? valid.payload.pinnedHexIds : [],
        validManualRange: valid.ok ? valid.payload.manualRange : null,
        secondPlanetType: valid.ok ? valid.payload.sectors['0-0'].planets[1].type : null,
        validPois: valid.ok ? Object.keys(valid.payload.deepSpacePois || {}) : [],
        namedGateCategory: valid.ok ? valid.payload.deepSpacePois['1-1'].poiCategory : null,
        namedGateState: valid.ok ? valid.payload.deepSpacePois['1-1'].jumpGateState : null,
        activeStateGateCategory: valid.ok ? valid.payload.deepSpacePois['1-2'].poiCategory : null,
        inactiveStateGateCategory: valid.ok ? valid.payload.deepSpacePois['2-2'].poiCategory : null
      };
    });

    expect(result.invalidOk).toBeFalsy();
    expect(result.validOk).toBeTruthy();
    expect(result.validWarning).toContain('invalid entries were ignored');
    expect(result.validSectors).toEqual(['0-0']);
    expect(result.validSelectedHexId).toBeNull();
    expect(result.validPinnedHexIds).toEqual(['0-0']);
    expect(result.validManualRange).toEqual({ min: 2, max: 12 });
    expect(result.secondPlanetType).toBe('Barren');
    expect(result.validPois).toEqual(['0-1', '1-1', '1-2', '2-2']);
    expect(result.namedGateCategory).toBeNull();
    expect(result.namedGateState).toBeNull();
    expect(result.activeStateGateCategory).toBe('jump_gate');
    expect(result.inactiveStateGateCategory).toBe('jump_gate');
  });

  test('jump-gate generation enforces max-one-per-sector and edge-only placement', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const generationData = await import('/js/generation-data.js');
      const poi = await import('/js/generation-poi.js');
      const model = await import('/js/jump-gate-model.js');

      generationData.hydrateGenerationData({
        deepSpacePoiTemplates: [
          {
            kind: 'Navigation',
            poiCategory: 'jump_gate',
            name: 'Inactive Jump-Gate',
            summary: 'Gate',
            risk: 'Low',
            rewardHint: 'Gate',
            weight: 9,
            jumpGateState: 'inactive'
          },
          {
            kind: 'Mystery',
            name: 'Anomaly',
            summary: 'Fallback',
            risk: 'Unknown',
            rewardHint: 'Fallback',
            weight: 1
          }
        ]
      });

      const pois = poi.generateDeepSpacePois(8, 8, {}, {
        randomFn: () => 0,
        sectorKey: 'NNNN',
        knownSectorRecords: {}
      });
      generationData.hydrateGenerationData({});

      const gateHexes = Object.entries(pois)
        .filter(([, value]) => model.isJumpGatePoi(value))
        .map(([hexId]) => hexId);
      const edgeDistances = gateHexes.map((hexId) => {
        const [cRaw, rRaw] = String(hexId).split('-');
        const c = Number(cRaw);
        const r = Number(rRaw);
        return Math.min(c, r, 7 - c, 7 - r);
      });

      return {
        gateCount: gateHexes.length,
        allEdgeEligible: edgeDistances.every((distance) => distance <= 2)
      };
    });

    expect(result.gateCount).toBeLessThanOrEqual(1);
    expect(result.allEdgeEligible).toBeTruthy();
  });

  test('active jump-gate spawn is suppressed by nearby active-gate sectors and remains deterministic', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const generationData = await import('/js/generation-data.js');
      const poi = await import('/js/generation-poi.js');
      const model = await import('/js/jump-gate-model.js');
      const utils = await import('/js/utils.js');

      generationData.hydrateGenerationData({
        deepSpacePoiTemplates: [
          {
            kind: 'Navigation',
            poiCategory: 'jump_gate',
            name: 'Active Jump-Gate',
            summary: 'Gate',
            risk: 'Low',
            rewardHint: 'Gate',
            weight: 9,
            jumpGateState: 'active'
          },
          {
            kind: 'Hazard',
            name: 'Storm',
            summary: 'Fallback',
            risk: 'High',
            rewardHint: 'Fallback',
            weight: 1
          }
        ]
      });

      const knownSectorRecords = {
        NNNO: {
          deepSpacePois: {
            '0-0': { poiCategory: 'jump_gate', jumpGateState: 'active' }
          }
        }
      };
      const makePois = () => {
        const rand = utils.mulberry32(utils.xmur3('phase2-deterministic')());
        return poi.generateDeepSpacePois(8, 8, {}, {
          randomFn: rand,
          sectorKey: 'NNNN',
          knownSectorRecords
        });
      };

      const first = makePois();
      const second = makePois();
      generationData.hydrateGenerationData({});

      const activeCount = Object.values(first).filter((value) => model.isActiveJumpGatePoi(value)).length;
      return {
        activeCount,
        deterministic: JSON.stringify(first) === JSON.stringify(second)
      };
    });

    expect(result.activeCount).toBe(0);
    expect(result.deterministic).toBeTruthy();
  });

  test('jump-gate linking prefers sensible directional sector pairing', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const gates = await import('/js/multi-sector-jump-gates.js');
      const sectorAddress = await import('/js/sector-address.js');

      const run = (hexId) => {
        const state = {
          currentSeed: 'seed-directional',
          layoutSeed: 'seed-directional',
          multiSector: {
            jumpGateRegistry: {},
            sectorsByKey: {
              NNNN: {
                config: { width: 8, height: 8 },
                sectors: {},
                deepSpacePois: {
                  [hexId]: {
                    kind: 'Navigation',
                    poiCategory: 'jump_gate',
                    name: 'Jump-Gate Test',
                    jumpGateState: 'active'
                  }
                }
              }
            }
          }
        };
        const ensureState = () => {};
        const service = gates.createJumpGateService(state, ensureState);
        service.ensureJumpGateLinksForRecord('NNNN', state.multiSector.sectorsByKey.NNNN);
        const pair = Object.values(state.multiSector.jumpGateRegistry)[0];
        return pair && pair.b ? pair.b.sectorKey : null;
      };

      const eastTargetKey = run('7-4');
      const northTargetKey = run('4-0');
      const east = sectorAddress.parseSectorKeyToCoords(eastTargetKey);
      const north = sectorAddress.parseSectorKeyToCoords(northTargetKey);

      return {
        eastTargetKey,
        northTargetKey,
        eastX: east ? east.x : null,
        northY: north ? north.y : null
      };
    });

    expect(result.eastTargetKey).toBeTruthy();
    expect(result.northTargetKey).toBeTruthy();
    expect(result.eastX).toBeGreaterThan(0);
    expect(result.northY).toBeLessThan(0);
  });
});
