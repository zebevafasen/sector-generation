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
          '1-2': { name: 'Stateful Active', kind: 'Navigation', jumpGateState: 'active', jumpGatePairId: 'pair-a', jumpGateLink: { sectorKey: 'NNNO', hexId: '0-0' } },
          '2-2': { name: 'Stateful Inactive', kind: 'Navigation', jumpGateState: 'inactive', jumpGatePairId: 'pair-a', jumpGateLink: { sectorKey: 'NNNN', hexId: '1-2' } },
          '2-1': { name: 'Broken Active', kind: 'Navigation', jumpGateState: 'active', jumpGatePairId: 'broken-without-link' },
          '0-0': { name: 'Should Drop', kind: 'Hazard' },
          '99-99': { name: 'Also Drop', kind: 'Mystery' }
        },
        multiSector: {
          currentKey: 'NNNN',
          selectedSectorKey: 'NNNN',
          sectorsByKey: { NNNN: {} },
          jumpGateRegistry: {
            goodPair: {
              a: { sectorKey: 'NNNN', hexId: '1-2' },
              b: { sectorKey: 'NNNO', hexId: '0-0' },
              state: 'active'
            },
            badPair: {
              a: { sectorKey: 'NNNN', hexId: 'not-a-hex' },
              b: { sectorKey: 'INVALID', hexId: '0-0' },
              state: 'active'
            }
          }
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
        inactiveStateGateCategory: valid.ok ? valid.payload.deepSpacePois['2-2'].poiCategory : null,
        hasBrokenActive: valid.ok ? Object.prototype.hasOwnProperty.call(valid.payload.deepSpacePois, '2-1') : false,
        registryKeys: valid.ok ? Object.keys((valid.payload.multiSector && valid.payload.multiSector.jumpGateRegistry) || {}) : []
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
    expect(result.hasBrokenActive).toBeFalsy();
    expect(result.registryKeys).toEqual(['goodPair']);
  });

  test('generation rollout stages resolve effective cluster/context flags per sector', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const rollout = await import('/js/generation-rollout.js');
      return {
        flagsOff: rollout.resolveGenerationRolloutFlags(
          { generationRolloutStage: 'flags_off', clusterV2Enabled: true, crossSectorContextEnabled: true },
          { isHomeSector: true }
        ),
        homeV2Home: rollout.resolveGenerationRolloutFlags(
          { generationRolloutStage: 'home_v2' },
          { isHomeSector: true }
        ),
        homeV2Neighbor: rollout.resolveGenerationRolloutFlags(
          { generationRolloutStage: 'home_v2' },
          { isHomeSector: false }
        ),
        neighborContextHome: rollout.resolveGenerationRolloutFlags(
          { generationRolloutStage: 'neighbor_context' },
          { isHomeSector: true }
        ),
        neighborContextNeighbor: rollout.resolveGenerationRolloutFlags(
          { generationRolloutStage: 'neighbor_context' },
          { isHomeSector: false }
        ),
        manual: rollout.resolveGenerationRolloutFlags(
          { generationRolloutStage: 'manual', clusterV2Enabled: false, crossSectorContextEnabled: true },
          { isHomeSector: true }
        ),
        fallbackStage: rollout.normalizeGenerationRolloutStage('not-a-stage')
      };
    });

    expect(result.flagsOff.clusterV2Enabled).toBeFalsy();
    expect(result.flagsOff.crossSectorContextEnabled).toBeFalsy();

    expect(result.homeV2Home.clusterV2Enabled).toBeTruthy();
    expect(result.homeV2Home.crossSectorContextEnabled).toBeFalsy();
    expect(result.homeV2Neighbor.clusterV2Enabled).toBeFalsy();
    expect(result.homeV2Neighbor.crossSectorContextEnabled).toBeFalsy();

    expect(result.neighborContextHome.clusterV2Enabled).toBeTruthy();
    expect(result.neighborContextHome.crossSectorContextEnabled).toBeFalsy();
    expect(result.neighborContextNeighbor.clusterV2Enabled).toBeTruthy();
    expect(result.neighborContextNeighbor.crossSectorContextEnabled).toBeTruthy();

    expect(result.manual.clusterV2Enabled).toBeFalsy();
    expect(result.manual.crossSectorContextEnabled).toBeTruthy();
    expect(result.fallbackStage).toBe('full_release');
  });

  test('orchestration uses center-biased core origin (not hard-center) as anchor and preferred auto core', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const orchestration = await import('/js/generation-orchestration.js');
      const utils = await import('/js/utils.js');
      const run = (randValue) => {
        let capturedClusterOptions = null;
        let capturedResolveArgs = null;
        const built = orchestration.buildSectorFromConfigAction({
          width: 5,
          height: 5,
          starDistribution: 'clusters',
          generationPerformanceDebugEnabled: false,
          coreScoringDebugEnabled: false,
          clusterV2Enabled: true,
          crossSectorContextEnabled: false,
          centerBiasStrength: 0.35
        }, {}, {
          sectorKey: 'NNNN'
        }, {
          state: { layoutSeed: 'seed-core-origin', currentSeed: 'seed-core-origin' },
          normalizeGenerationConfig: (value) => value,
          isHexIdInBounds: utils.isHexIdInBounds,
          computeSystemCount: () => 6,
          shuffleArray: () => {},
          rand: () => randValue,
          deepClone: (value) => JSON.parse(JSON.stringify(value)),
          selectClusteredSystemCoords: (candidateCoords, count) => candidateCoords.slice(0, count),
          selectClusteredSystemCoordsV2: (candidateCoords, count, _rand, options) => {
            capturedClusterOptions = options;
            return candidateCoords.slice(0, count);
          },
          createGenerationContext: () => null,
          generateSystemData: (_config, context) => ({
            name: `S-${context.coordId}`,
            planets: [{ pop: 0.8, habitable: true }]
          }),
          computeCoreSystemScore: () => 1,
          getActiveJumpGateSectorWeightMultiplier: () => 1,
          generateDeepSpacePois: () => ({}),
          resolveCoreSystemHexId: (args) => {
            capturedResolveArgs = args;
            return { coreSystemHexId: args.preferredHexId, coreSystemManual: !!args.preferredIsManual };
          },
          homeSectorKey: 'NNNN'
        });
        return {
          capturedPreferredAnchor: capturedClusterOptions ? capturedClusterOptions.preferredPrimaryAnchorHexId : null,
          capturedPreferredHexId: capturedResolveArgs ? capturedResolveArgs.preferredHexId : null,
          coreSystemHexId: built.coreSystemHexId,
          generatedHexIds: Object.keys(built.sectors || {})
        };
      };

      return {
        lowRoll: run(0.0),
        highRoll: run(0.9999)
      };
    });

    expect(result.lowRoll.capturedPreferredAnchor).toBeTruthy();
    expect(result.highRoll.capturedPreferredAnchor).toBeTruthy();
    expect(result.lowRoll.generatedHexIds.includes(result.lowRoll.capturedPreferredAnchor)).toBeTruthy();
    expect(result.highRoll.generatedHexIds.includes(result.highRoll.capturedPreferredAnchor)).toBeTruthy();
    expect(result.lowRoll.capturedPreferredHexId).toBe(result.lowRoll.capturedPreferredAnchor);
    expect(result.highRoll.capturedPreferredHexId).toBe(result.highRoll.capturedPreferredAnchor);
    expect(result.lowRoll.coreSystemHexId).toBe(result.lowRoll.capturedPreferredAnchor);
    expect(result.highRoll.coreSystemHexId).toBe(result.highRoll.capturedPreferredAnchor);
    expect(result.lowRoll.capturedPreferredAnchor).not.toBe(result.highRoll.capturedPreferredAnchor);
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

  test('jump-gate bypass can spawn on edge even when emptiness spawn roll would fail', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const generationData = await import('/js/generation-data.js');
      const poi = await import('/js/generation-poi.js');
      const model = await import('/js/jump-gate-model.js');

      generationData.hydrateGenerationData({
        jumpGateRules: {
          maxPerSector: 1,
          minSectorSeparation: 2,
          edgeDistanceMax: 1,
          minHexSeparation: 1,
          activeSuppressionByDistance: { 1: 0, 2: 0.35, 3: 0.65 },
          edgeWeightByDistance: { 1: 2.0, 2: 1.3, 3: 1.0, default: 0.2 }
        },
        deepSpacePoiTemplates: [
          {
            kind: 'Navigation',
            poiCategory: 'jump_gate',
            name: 'Active Jump-Gate',
            summary: 'Gate',
            risk: 'Low',
            rewardHint: 'Gate',
            weight: 1,
            jumpGateState: 'active'
          },
          {
            kind: 'Navigation',
            poiCategory: 'jump_gate',
            name: 'Inactive Jump-Gate',
            summary: 'Gate',
            risk: 'Medium',
            rewardHint: 'Gate',
            weight: 1,
            jumpGateState: 'inactive'
          },
          {
            kind: 'Mystery',
            name: 'Fallback',
            summary: 'Fallback',
            risk: 'Unknown',
            rewardHint: 'Fallback',
            weight: 1
          }
        ]
      });

      const sectors = {};
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          const hexId = `${c}-${r}`;
          if (hexId !== '0-0') sectors[hexId] = { name: `S-${hexId}`, planets: [] };
        }
      }

      const rolls = [0.001, 0.2, 0.2, 0.95, 0.95, 0.95];
      let idx = 0;
      const randomFn = () => {
        const next = idx < rolls.length ? rolls[idx] : 0.95;
        idx++;
        return next;
      };
      const pois = poi.generateDeepSpacePois(3, 3, sectors, {
        randomFn,
        sectorKey: 'NNNN',
        knownSectorRecords: {}
      });
      generationData.hydrateGenerationData({});
      const gateHexes = Object.entries(pois)
        .filter(([, value]) => model.isJumpGatePoi(value))
        .map(([hexId]) => hexId);
      return { gateHexes };
    });

    expect(result.gateHexes).toEqual(['0-0']);
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

  test('deep-space POI generation is independent from core-system hex inputs', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const poi = await import('/js/generation-poi.js');
      const utils = await import('/js/utils.js');
      const sectors = {
        '2-2': { name: 'Center', planets: [] },
        '4-4': { name: 'Outer', planets: [] }
      };
      const run = (coreSystemHexId) => {
        const rand = utils.mulberry32(utils.xmur3('poi-core-detach-seed')());
        return poi.generateDeepSpacePois(8, 8, sectors, {
          randomFn: rand,
          sectorKey: 'NNNN',
          knownSectorRecords: {},
          coreSystemHexId
        });
      };
      const withCenterCore = run('2-2');
      const withOuterCore = run('4-4');
      const withoutCore = run(null);
      return {
        centerVsOuter: JSON.stringify(withCenterCore) === JSON.stringify(withOuterCore),
        centerVsNone: JSON.stringify(withCenterCore) === JSON.stringify(withoutCore)
      };
    });

    expect(result.centerVsOuter).toBeTruthy();
    expect(result.centerVsNone).toBeTruthy();
  });

  test('deep-space POIs prefer hexes with emptier local neighborhoods', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const poi = await import('/js/generation-poi.js');
      const spatial = await import('/js/generation-spatial.js');

      const width = 10;
      const height = 10;
      const sectors = {};
      for (let c = 3; c <= 6; c++) {
        sectors[`${c}-4`] = { name: `S-${c}-4`, planets: [] };
        sectors[`${c}-5`] = { name: `S-${c}-5`, planets: [] };
      }
      sectors['2-5'] = { name: 'S-2-5', planets: [] };
      sectors['7-4'] = { name: 'S-7-4', planets: [] };

      const pois = poi.generateDeepSpacePois(width, height, sectors, {
        randomFn: (() => {
          const seed = 13371337;
          let x = seed;
          return () => {
            x = (x * 1664525 + 1013904223) % 4294967296;
            return x / 4294967296;
          };
        })(),
        sectorKey: 'NNNN',
        knownSectorRecords: {}
      });

      const isInBounds = (c, r) => c >= 0 && r >= 0 && c < width && r < height;
      const scoreHex = (hexId) => {
        const [cRaw, rRaw] = String(hexId).split('-');
        const c = Number(cRaw);
        const r = Number(rRaw);
        if (!Number.isFinite(c) || !Number.isFinite(r)) return 0;
        let total = 0;
        let occupied = 0;
        for (let nc = c - 2; nc <= c + 2; nc++) {
          for (let nr = r - 2; nr <= r + 2; nr++) {
            if (!isInBounds(nc, nr) || (nc === c && nr === r)) continue;
            const other = `${nc}-${nr}`;
            const dist = spatial.hexDistanceById(hexId, other);
            if (!Number.isFinite(dist) || dist <= 0 || dist > 2) continue;
            total++;
            if (sectors[other]) occupied++;
          }
        }
        return total > 0 ? 1 - (occupied / total) : 1;
      };

      const allCandidateScores = [];
      for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
          const hexId = `${c}-${r}`;
          if (sectors[hexId]) continue;
          allCandidateScores.push(scoreHex(hexId));
        }
      }
      const poiScores = Object.keys(pois).map(scoreHex);
      const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

      return {
        poiCount: poiScores.length,
        poiAvgEmptiness: avg(poiScores),
        baselineAvgEmptiness: avg(allCandidateScores)
      };
    });

    expect(result.poiCount).toBeGreaterThan(0);
    expect(result.poiAvgEmptiness).toBeGreaterThan(result.baselineAvgEmptiness);
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

  test('jump-gate suppression tuning follows configured distance multipliers', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const generationData = await import('/js/generation-data.js');
      const poi = await import('/js/generation-poi.js');

      generationData.hydrateGenerationData({
        jumpGateRules: {
          maxPerSector: 1,
          minSectorSeparation: 2,
          edgeDistanceMax: 2,
          minHexSeparation: 4,
          activeSuppressionByDistance: {
            1: 0.11,
            2: 0.22,
            3: 0.33
          },
          edgeWeightByDistance: {
            1: 2.0,
            2: 1.5,
            3: 1.0,
            default: 0.2
          }
        }
      });

      const fromOne = poi.getActiveJumpGateSectorWeightMultiplier('NNNN', {
        NNNO: { deepSpacePois: { '0-0': { poiCategory: 'jump_gate', jumpGateState: 'active' } } }
      });
      const fromTwo = poi.getActiveJumpGateSectorWeightMultiplier('NNNN', {
        NNNP: { deepSpacePois: { '0-0': { poiCategory: 'jump_gate', jumpGateState: 'active' } } }
      });
      const fromThree = poi.getActiveJumpGateSectorWeightMultiplier('NNNN', {
        NNNQ: { deepSpacePois: { '0-0': { poiCategory: 'jump_gate', jumpGateState: 'active' } } }
      });

      generationData.hydrateGenerationData({});
      return { fromOne, fromTwo, fromThree };
    });

    expect(result.fromOne).toBe(0.11);
    expect(result.fromTwo).toBe(0.22);
    expect(result.fromThree).toBe(0.33);
  });

  test('core system selection is deterministic and respects valid preferred overrides', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const core = await import('/js/core-system.js');
      const sectors = {
        '0-0': {
          planets: [
            { pop: 0, habitable: false },
            { pop: 0.2, habitable: false }
          ]
        },
        '2-2': {
          planets: [
            { pop: 0.4, habitable: true },
            { pop: 0.2, habitable: true }
          ]
        },
        '3-3': {
          planets: [
            { pop: 1.2, habitable: false }
          ]
        }
      };

      const picked = core.pickCoreSystemHexId(sectors, 4, 4);
      const resolvedPreferred = core.resolveCoreSystemHexId({
        sectors,
        width: 4,
        height: 4,
        preferredHexId: '3-3',
        preferredIsManual: true
      });
      const resolvedInvalidPreferred = core.resolveCoreSystemHexId({
        sectors,
        width: 4,
        height: 4,
        preferredHexId: '9-9',
        preferredIsManual: true
      });
      const resolvedAutoPreferred = core.resolveCoreSystemHexId({
        sectors,
        width: 4,
        height: 4,
        preferredHexId: '3-3',
        preferredIsAuto: true
      });
      const resolvedIgnoredAutoPreferred = core.resolveCoreSystemHexId({
        sectors,
        width: 4,
        height: 4,
        preferredHexId: '3-3',
        preferredIsManual: false,
        preferredIsAuto: false
      });
      const resolvedWithDebug = core.resolveCoreSystemHexId({
        sectors,
        width: 4,
        height: 4,
        settings: {
          coreScoreWeights: {
            base: 0,
            centrality: 5,
            population: 10,
            habitability: 25,
            context: 0
          }
        },
        debugScoring: true
      });

      return {
        picked,
        resolvedPreferred,
        resolvedInvalidPreferred,
        resolvedAutoPreferred,
        resolvedIgnoredAutoPreferred,
        hasDebugScores: !!(resolvedWithDebug && resolvedWithDebug.debugScores),
        debugScoreKeys: resolvedWithDebug && resolvedWithDebug.debugScores
          ? Object.keys(resolvedWithDebug.debugScores).length
          : 0
      };
    });

    expect(result.picked).toBe('2-2');
    expect(result.resolvedPreferred).toEqual({
      coreSystemHexId: '3-3',
      coreSystemManual: true
    });
    expect(result.resolvedInvalidPreferred).toEqual({
      coreSystemHexId: '2-2',
      coreSystemManual: false
    });
    expect(result.resolvedAutoPreferred).toEqual({
      coreSystemHexId: '3-3',
      coreSystemManual: false
    });
    expect(result.resolvedIgnoredAutoPreferred).toEqual({
      coreSystemHexId: '2-2',
      coreSystemManual: false
    });
    expect(result.hasDebugScores).toBeTruthy();
    expect(result.debugScoreKeys).toBeGreaterThan(0);
  });

  test('generation context is deterministic and exposes boundary/core signals', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const ctx = await import('/js/generation-context.js');
      const context = ctx.createGenerationContext('seed-a', {
        NNNN: {
          config: { width: 4, height: 4 },
          sectors: {
            '3-1': { planets: [{ tags: ['Trade'] }] },
            '3-2': { planets: [{ tags: ['Logistics'] }] }
          },
          coreSystemHexId: '3-1'
        },
        NNNO: {
          config: { width: 4, height: 4 },
          sectors: {
            '0-1': { planets: [{ tags: ['Capital'] }] },
            '0-2': { planets: [{ tags: ['Trade'] }] },
            '0-0': { planets: [{ tags: ['Trade'] }] }
          },
          coreSystemHexId: '0-1'
        }
      }, {
        crossSectorContextEnabled: true,
        boundaryContinuityStrength: 1
      });
      const edgePressure = context.getEdgePressure('NNNN', 'south');
      const coreBias = context.getCoreBias('NNNN');
      const intent = context.getSectorIntent('NNNN');
      const neighborSummaries = context.getNeighborSummaries('NNNN');
      const summary = context.getSummary('NNNN');
      return {
        edgePressure,
        coreBias,
        neighborCount: neighborSummaries.length,
        neighborHasTags: neighborSummaries.some((n) => (n.summary?.dominantTagSignals || []).includes('trade')),
        hasDensityMap: Array.isArray(summary?.densityMap) && summary.densityMap.length === 3,
        intent
      };
    });

    expect(result.edgePressure).toBeGreaterThan(0);
    expect(result.coreBias).toBeGreaterThan(0);
    expect(result.neighborCount).toBeGreaterThan(0);
    expect(result.neighborHasTags).toBeTruthy();
    expect(result.hasDensityMap).toBeTruthy();
    expect(result.intent.coreBias).toBeGreaterThan(0);
  });

  test('generation context handles single-sector records without neighbors', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const ctx = await import('/js/generation-context.js');
      const context = ctx.createGenerationContext('seed-single', {
        NNNN: {
          config: { width: 4, height: 4 },
          sectors: { '1-1': { planets: [] } },
          coreSystemHexId: '1-1'
        }
      }, {
        crossSectorContextEnabled: true,
        boundaryContinuityStrength: 1
      });
      return {
        neighbors: context.getNeighborSummaries('NNNN').length,
        edgePressure: context.getEdgePressure('NNNN', 'north'),
        coreBias: context.getCoreBias('NNNN'),
        hasSummary: !!context.getSummary('NNNN')
      };
    });

    expect(result.neighbors).toBe(0);
    expect(result.edgePressure).toBe(0);
    expect(result.coreBias).toBe(0);
    expect(result.hasSummary).toBeTruthy();
  });

  test('generation context summaries rebuild deterministically for sector records', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const mod = await import('/js/generation-context-summary.js');
      const records = {
        NNNN: {
          config: { width: 4, height: 4 },
          sectors: { '1-1': {}, '2-2': {} },
          deepSpacePois: {},
          coreSystemHexId: '1-1',
          coreSystemManual: false,
          totalHexes: 16,
          systemCount: 2
        },
        NNNO: {
          config: { width: 4, height: 4 },
          sectors: { '0-1': {}, '0-2': {}, '0-0': {} },
          deepSpacePois: {},
          coreSystemHexId: '0-1',
          coreSystemManual: false,
          totalHexes: 16,
          systemCount: 3
        }
      };
      mod.rebuildGenerationContextSummaries({
        layoutSeed: 'seed-context-summary',
        sectorsByKey: records,
        settings: { boundaryContinuityStrength: 0.55 }
      });
      const first = JSON.stringify(records);
      mod.rebuildGenerationContextSummaries({
        layoutSeed: 'seed-context-summary',
        sectorsByKey: records,
        settings: { boundaryContinuityStrength: 0.55 }
      });
      const second = JSON.stringify(records);
      return {
        deterministic: first === second,
        hasSummaryA: !!records.NNNN.generationContextSummary,
        hasSummaryB: !!records.NNNO.generationContextSummary,
        edgeKeys: Object.keys(records.NNNN.generationContextSummary?.edgeOccupancy || {})
      };
    });

    expect(result.deterministic).toBeTruthy();
    expect(result.hasSummaryA).toBeTruthy();
    expect(result.hasSummaryB).toBeTruthy();
    expect(result.edgeKeys.sort()).toEqual(['east', 'north', 'south', 'west']);
  });

  test('generation context cache remains bounded to prevent memory growth', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const ctx = await import('/js/generation-context.js');
      ctx.clearGenerationContextCacheForDebug();
      for (let i = 0; i < 60; i++) {
        const key = `NN${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i + 3) % 26))}`;
        ctx.createGenerationContext(`seed-${i}`, {
          [key]: {
            config: { width: 4, height: 4 },
            sectors: { '1-1': {}, '2-2': {} },
            coreSystemHexId: '1-1'
          }
        }, {
          crossSectorContextEnabled: true,
          boundaryContinuityStrength: 0.55
        });
      }
      const cacheSize = ctx.getGenerationContextCacheSizeForDebug();
      ctx.clearGenerationContextCacheForDebug();
      const cacheSizeAfterClear = ctx.getGenerationContextCacheSizeForDebug();
      return { cacheSize, cacheSizeAfterClear };
    });

    expect(result.cacheSize).toBeLessThanOrEqual(24);
    expect(result.cacheSizeAfterClear).toBe(0);
  });

  test('cluster v2 keeps deterministic picks and improves center occupancy on fixed seed', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const utils = await import('/js/utils.js');
      const spatial = await import('/js/generation-spatial.js');
      const clusterV2 = await import('/js/generation-cluster-v2.js');
      const metrics = await import('/js/generation-metrics.js');

      const allCoords = [];
      for (let c = 0; c < 8; c++) {
        for (let r = 0; r < 10; r++) {
          allCoords.push(`${c}-${r}`);
        }
      }

      const makeRandom = () => utils.mulberry32(utils.xmur3('cluster-v2-deterministic')());
      const oldPicked = spatial.selectClusteredSystemCoords(allCoords, 24, makeRandom());
      const v2PickedA = clusterV2.selectClusteredSystemCoordsV2(allCoords, 24, makeRandom(), {
        width: 8,
        height: 10,
        sectorKey: 'NNNN',
        isHomeSector: true,
        settings: {
          centerBiasStrength: 1.35,
          boundaryContinuityStrength: 0.55,
          clusterAnchorJitter: 1.25,
          clusterGrowthDecay: 0.82,
          clusterLocalNeighborCap: 5,
          clusterSecondaryAnchorThreshold: 11,
          clusterEdgeBalance: 0.26,
          clusterCenterVoidProtection: 0.35
        },
        generationContext: null
      });
      const v2PickedB = clusterV2.selectClusteredSystemCoordsV2(allCoords, 24, makeRandom(), {
        width: 8,
        height: 10,
        sectorKey: 'NNNN',
        isHomeSector: true,
        settings: {
          centerBiasStrength: 1.35,
          boundaryContinuityStrength: 0.55,
          clusterAnchorJitter: 1.25,
          clusterGrowthDecay: 0.82,
          clusterLocalNeighborCap: 5,
          clusterSecondaryAnchorThreshold: 11,
          clusterEdgeBalance: 0.26,
          clusterCenterVoidProtection: 0.35
        },
        generationContext: null
      });

      const oldSectors = Object.fromEntries(oldPicked.map((hexId) => [hexId, {}]));
      const v2Sectors = Object.fromEntries(v2PickedA.map((hexId) => [hexId, {}]));
      const oldMetrics = metrics.computeSectorGenerationMetrics({ width: 8, height: 10, sectors: oldSectors });
      const v2Metrics = metrics.computeSectorGenerationMetrics({ width: 8, height: 10, sectors: v2Sectors });

      return {
        deterministic: JSON.stringify(v2PickedA) === JSON.stringify(v2PickedB),
        oldCenter: oldMetrics.centerOccupancyRatio,
        v2Center: v2Metrics.centerOccupancyRatio,
        oldCompactness: oldMetrics.clusterCompactness,
        v2Compactness: v2Metrics.clusterCompactness
      };
    });

    expect(result.deterministic).toBeTruthy();
    expect(result.v2Center).toBeGreaterThan(0.08);
    expect(result.v2Compactness).toBeGreaterThanOrEqual(result.oldCompactness);
  });

  test('cluster v2 growth pass enforces local occupancy caps', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const utils = await import('/js/utils.js');
      const clusterV2 = await import('/js/generation-cluster-v2.js');
      const spatial = await import('/js/generation-spatial.js');

      const allCoords = [];
      for (let c = 0; c < 8; c++) {
        for (let r = 0; r < 8; r++) {
          allCoords.push(`${c}-${r}`);
        }
      }
      const rand = utils.mulberry32(utils.xmur3('cluster-v2-cap-test')());
      const selected = clusterV2.selectClusteredSystemCoordsV2(allCoords, 24, rand, {
        width: 8,
        height: 8,
        sectorKey: 'NNNN',
        isHomeSector: true,
        settings: {
          centerBiasStrength: 1.35,
          boundaryContinuityStrength: 0.55,
          clusterAnchorJitter: 1.25,
          clusterGrowthDecay: 0.82,
          clusterLocalNeighborCap: 3,
          clusterSecondaryAnchorThreshold: 11,
          clusterEdgeBalance: 0.26,
          clusterCenterVoidProtection: 0.35
        },
        generationContext: null
      });
      const maxLocalNeighbors = selected.reduce((max, hexId) => {
        const neighbors = selected.reduce((count, otherHexId) => (
          count + (otherHexId !== hexId && spatial.hexDistanceById(hexId, otherHexId) <= 2 ? 1 : 0)
        ), 0);
        return Math.max(max, neighbors);
      }, 0);
      return { selectedCount: selected.length, maxLocalNeighbors };
    });

    expect(result.selectedCount).toBe(24);
    expect(result.maxLocalNeighbors).toBeLessThanOrEqual(5);
  });

  test('cluster v2 clamps per-anchor cluster size to a maximum of 5', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const utils = await import('/js/utils.js');
      const clusterV2 = await import('/js/generation-cluster-v2.js');

      const allCoords = [];
      for (let c = 0; c < 12; c++) {
        for (let r = 0; r < 12; r++) {
          allCoords.push(`${c}-${r}`);
        }
      }
      const rand = utils.mulberry32(utils.xmur3('cluster-v2-clamp-6-test')());
      const debugCollector = {};
      const selected = clusterV2.selectClusteredSystemCoordsV2(allCoords, 30, rand, {
        width: 12,
        height: 12,
        sectorKey: 'NNNN',
        isHomeSector: true,
        settings: {
          centerBiasStrength: 1.35,
          boundaryContinuityStrength: 0.55,
          clusterAnchorJitter: 1.25,
          clusterGrowthDecay: 0.82,
          clusterLocalNeighborCap: 5,
          clusterSecondaryAnchorThreshold: 7,
          clusterEdgeBalance: 0.26,
          clusterCenterVoidProtection: 0.35
        },
        generationContext: null,
        debugCollector
      });

      return {
        selectedCount: selected.length,
        maxAnchorClusterSize: Number(debugCollector.maxAnchorClusterSize || 0)
      };
    });

    expect(result.selectedCount).toBe(30);
    expect(result.maxAnchorClusterSize).toBeLessThanOrEqual(5);
  });

  test('cluster v2 blends boundary pressure to smooth seams without mirroring', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const utils = await import('/js/utils.js');
      const clusterV2 = await import('/js/generation-cluster-v2.js');

      const allCoords = [];
      for (let c = 0; c < 8; c++) {
        for (let r = 0; r < 8; r++) {
          allCoords.push(`${c}-${r}`);
        }
      }
      const baseSettings = {
        centerBiasStrength: 1.35,
        boundaryContinuityStrength: 0.7,
        clusterAnchorJitter: 1.25,
        clusterGrowthDecay: 0.82,
        clusterLocalNeighborCap: 4,
        clusterSecondaryAnchorThreshold: 11,
        clusterEdgeBalance: 0.26,
        clusterCenterVoidProtection: 0.35
      };
      const highPressureContext = {
        getEdgePressure: (_sectorKey, direction) => (direction === 'east' ? 0.95 : 0),
        getCoreBias: () => 0
      };
      const lowPressureContext = {
        getEdgePressure: () => 0,
        getCoreBias: () => 0
      };

      const run = (seed, generationContext) => {
        const rand = utils.mulberry32(utils.xmur3(seed)());
        return clusterV2.selectClusteredSystemCoordsV2(allCoords, 24, rand, {
          width: 8,
          height: 8,
          sectorKey: 'NNNN',
          isHomeSector: false,
          settings: baseSettings,
          generationContext
        });
      };
      const withPressure = run('boundary-smoothing-seed', highPressureContext);
      const withoutPressure = run('boundary-smoothing-seed', lowPressureContext);
      const eastBandCount = (hexes) => hexes.filter((hexId) => {
        const [cRaw] = String(hexId).split('-');
        const c = Number(cRaw);
        return Number.isFinite(c) && c >= 6;
      }).length;
      return {
        withPressureEast: eastBandCount(withPressure),
        withoutPressureEast: eastBandCount(withoutPressure),
        exactMirror: JSON.stringify(withPressure) === JSON.stringify(withoutPressure)
      };
    });

    expect(result.withPressureEast).toBeGreaterThanOrEqual(result.withoutPressureEast);
    expect(result.exactMirror).toBeFalsy();
  });

  test('core scoring applies tag weights with caps and stays deterministic', async ({ page }) => {
    await page.goto('/sector_generator.html');

    const result = await page.evaluate(async () => {
      const core = await import('/js/core-system.js');
      const settings = {
        coreTagWeights: { trade: 8, frontier: -5 },
        coreTagContributionCap: 10,
        coreTagPerTagCap: 6,
        coreScoreWeights: { centrality: 5, population: 10, habitability: 25, context: 0, base: 0 }
      };
      const sectors = {
        '1-1': {
          tags: ['trade', 'trade', 'trade'],
          planets: [{ pop: 0.6, habitable: true, tags: ['trade'] }]
        },
        '2-2': {
          tags: ['frontier'],
          planets: [{ pop: 0.8, habitable: true, tags: ['frontier'] }]
        }
      };
      const first = core.pickCoreSystemHexId(sectors, 4, 4, { settings });
      const second = core.pickCoreSystemHexId(sectors, 4, 4, { settings });
      const scoreTrade = core.computeCoreSystemScore(sectors['1-1'], '1-1', 4, 4, { settings });
      const scoreFrontier = core.computeCoreSystemScore(sectors['2-2'], '2-2', 4, 4, { settings });
      return {
        first,
        second,
        scoreTrade,
        scoreFrontier
      };
    });

    expect(result.first).toBe(result.second);
    expect(result.first).toBe('1-1');
    expect(result.scoreTrade).toBeGreaterThan(result.scoreFrontier);
  });
});
