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
        validPois: valid.ok ? Object.keys(valid.payload.deepSpacePois || {}) : []
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
    expect(result.validPois).toEqual(['0-1']);
  });
});
