const { test, expect } = require('@playwright/test');

function parseCountFromLabel(labelText) {
  const match = String(labelText || '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

test('route planner can create and clear a shortcut route overlay', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const populatedHexes = page.locator('.hex-group').filter({
    has: page.locator('circle.star-circle')
  });
  const populatedCount = await populatedHexes.count();
  expect(populatedCount).toBeGreaterThan(1);

  const startHex = populatedHexes.first();
  await startHex.click({ modifiers: ['Shift'] });

  let routeFound = false;
  const maxCandidates = Math.min(populatedCount, 12);
  for (let i = 1; i < maxCandidates; i++) {
    const candidateHex = populatedHexes.nth(i);
    await candidateHex.click({ modifiers: ['Shift'] });
    const routeCount = await page.locator('#mapViewport polyline').count();
    if (routeCount > 0) {
      routeFound = true;
      break;
    }
  }
  expect(routeFound).toBeTruthy();

  await expect(page.locator('#mapViewport circle[fill=\"#22c55e\"]')).toHaveCount(1);
  await expect(page.locator('#mapViewport circle[fill=\"#f43f5e\"]')).toHaveCount(1);

  await startHex.click();
  await expect(page.locator('#mapViewport polyline')).toHaveCount(0);
});

test('expanded view hex click selects and highlights the clicked sector after clear', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();
  await page.evaluate(() => {
    const currentLabel = document.getElementById('currentSectorLabel');
    const sourceSectorKey = String(currentLabel?.textContent || '').replace('Current:', '').trim();
    window.dispatchEvent(new CustomEvent('requestMoveSectorEdge', {
      detail: { sourceSectorKey, direction: 'east' }
    }));
  });
  await page.locator('#toggleExpandedSectorViewBtn').click();

  await page.locator('#mapContainer').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.hex.selected')).toHaveCount(0);

  const currentLabel = await page.locator('#currentSectorLabel').innerText();
  const currentKey = currentLabel.replace('Current:', '').trim();
  const sectorKeys = await page.locator('.sector-layer').evaluateAll((layers) =>
    layers.map((layer) => String(layer.getAttribute('data-sector-key') || '').trim()).filter(Boolean)
  );
  const targetKey = sectorKeys.find((key) => key !== currentKey);
  expect(targetKey).toBeTruthy();

  await page.evaluate((key) => {
    const node = document.querySelector(`.sector-layer[data-sector-key="${key}"] .hex-group[data-id="0-0"]`);
    if (!node) throw new Error('Target hex not found.');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, targetKey);
  await expect(page.locator(`.sector-layer.current-sector-layer[data-sector-key="${targetKey}"]`)).toHaveCount(1);
  await expect(page.locator(`.sector-layer[data-sector-key="${targetKey}"] .sector-frame.sector-frame-selected`)).toHaveCount(1);
  await expect(page.locator(`.sector-layer[data-sector-key="${targetKey}"] .hex.selected`)).toHaveCount(1);
});

test('route planner can bridge long gaps using refueling-station POIs', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#modeSizeCustomBtn').click();
  await page.locator('#gridWidth').fill('1');
  await page.locator('#gridHeight').fill('6');
  await page.locator('#modeManualBtn').click();
  await page.locator('#manualMin').fill('0');
  await page.locator('#manualMax').fill('0');
  await page.locator('#generateSectorBtn').click();

  await page.locator('#editModeToggleBtn').click();
  await expect(page.locator('#editModeToggleBtn')).toContainText('EDIT MODE: ON');

  await page.locator('.hex-group[data-id="0-0"]').click();
  await page.locator('#addSystemHereBtn').click();
  await page.locator('.hex-group[data-id="0-5"]').click();
  await page.locator('#addSystemHereBtn').click();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('routeShortcutHex', { detail: { hexId: '0-0' } }));
    window.dispatchEvent(new CustomEvent('routeShortcutHex', { detail: { hexId: '0-5' } }));
  });
  await expect(page.locator('#mapViewport polyline')).toHaveCount(0);

  await page.locator('.hex-group[data-id="0-3"]').click();
  await expect(page.locator('#addPoiHereBtn')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#addPoiHereBtn')).toBeEnabled();
  await page.locator('#addPoiHereBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('Added POI');

  const ensureNavigationPoi = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const detailsText = await page.locator('#emptyDetails').innerText();
      if (/Type\s*Navigation/i.test(detailsText)) return;
      await page.locator('#rerollSelectedSystemBtn').click();
      await expect(page.locator('#statusMessage')).toContainText('Rerolled POI');
    }
    throw new Error('Unable to roll a Navigation POI in 20 attempts.');
  };
  await ensureNavigationPoi();

  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept('Refueling Station 777')),
    page.locator('#renamePoiBtn').click()
  ]);
  await expect(page.locator('#statusMessage')).toContainText('Renamed POI');

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('routeShortcutHex', { detail: { hexId: '0-0' } }));
    window.dispatchEvent(new CustomEvent('routeShortcutHex', { detail: { hexId: '0-5' } }));
  });
  await expect(page.locator('#mapViewport polyline')).toHaveCount(1);
});

test('json export can be imported to restore sector stats', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const systemsLabelBefore = await page.locator('#statusTotalSystems').innerText();
  const expectedSystemsCount = parseCountFromLabel(systemsLabelBefore);

  await page.locator('#exportSectorBtn').click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportJsonBtn').click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).toBeTruthy();

  const exportedPayloadText = await require('node:fs/promises').readFile(path, 'utf8');
  const exportedPayload = JSON.parse(exportedPayloadText);
  expect(exportedPayload).toHaveProperty('sectors');
  expect(exportedPayload).toHaveProperty('stats.totalSystems');

  await page.locator('#generateSectorBtn').click();

  await page.locator('#importFileInput').setInputFiles({
    name: 'reimport-sector.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedPayloadText, 'utf8')
  });

  await expect(page.locator('#statusMessage')).toContainText('Imported sector data.');
  await expect(page.locator('#statusTotalSystems')).toHaveText(`${expectedSystemsCount} Systems`);
});

test('edit mode allows deleting a selected body', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const populatedHex = page.locator('.hex-group').filter({
    has: page.locator('circle.star-circle')
  }).first();
  await populatedHex.click();

  await expect(page.locator('#systemDetails')).toBeVisible();

  const planetCountBefore = parseInt(await page.locator('#infoPlanetCount').innerText(), 10);
  expect(planetCountBefore).toBeGreaterThan(0);

  await page.locator('#editModeToggleBtn').click();
  await expect(page.locator('#editModeToggleBtn')).toContainText('EDIT MODE: ON');

  await page.locator('#infoPlanetList li').first().click();
  await expect(page.locator('#quickDeleteBodyBtn')).toBeVisible();
  await expect(page.locator('#quickDeleteBodyBtn')).toBeEnabled();

  await page.locator('#quickDeleteBodyBtn').click();

  const planetCountAfter = parseInt(await page.locator('#infoPlanetCount').innerText(), 10);
  expect(planetCountAfter).toBeLessThan(planetCountBefore);
});

test('edit mode warns before replacing a deep-space POI with a system', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#sizePreset').selectOption('dominion');
  await page.locator('#generateSectorBtn').click();

  let poiCount = await page.locator('polygon.deep-space-poi-marker').count();
  for (let attempt = 0; attempt < 3 && poiCount === 0; attempt++) {
    await page.locator('#generateSectorBtn').click();
    poiCount = await page.locator('polygon.deep-space-poi-marker').count();
  }
  expect(poiCount).toBeGreaterThan(0);

  await page.locator('#editModeToggleBtn').click();
  await expect(page.locator('#editModeToggleBtn')).toContainText('EDIT MODE: ON');

  const poiHex = page.locator('.hex-group').filter({
    has: page.locator('polygon.deep-space-poi-marker')
  }).first();
  await poiHex.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#addSystemHereBtn')).toBeVisible();

  const systemsBefore = parseCountFromLabel(await page.locator('#statusTotalSystems').innerText());

  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.dismiss()),
    page.locator('#addSystemHereBtn').click()
  ]);

  await expect(page.locator('#statusMessage')).toContainText('cancelled');
  const systemsAfterCancel = parseCountFromLabel(await page.locator('#statusTotalSystems').innerText());
  expect(systemsAfterCancel).toBe(systemsBefore);

  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept()),
    page.locator('#addSystemHereBtn').click()
  ]);

  await expect(page.locator('#statusMessage')).toContainText('Added system');
  const systemsAfterAccept = parseCountFromLabel(await page.locator('#statusTotalSystems').innerText());
  expect(systemsAfterAccept).toBeGreaterThan(systemsBefore);
});

test('edit mode can add and delete a deep-space POI from empty hexes', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();
  await page.locator('#editModeToggleBtn').click();
  await expect(page.locator('#editModeToggleBtn')).toContainText('EDIT MODE: ON');

  const emptyHex = page.locator('.hex-group').filter({
    hasNot: page.locator('circle.star-circle')
  }).filter({
    hasNot: page.locator('polygon.deep-space-poi-marker')
  }).first();
  await emptyHex.click();

  await expect(page.locator('#addPoiHereBtn')).toBeVisible();
  const poiCountBefore = await page.locator('polygon.deep-space-poi-marker').count();
  await page.locator('#addPoiHereBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('Added POI');

  const poiCountAfterAdd = await page.locator('polygon.deep-space-poi-marker').count();
  expect(poiCountAfterAdd).toBeGreaterThan(poiCountBefore);
  await expect(page.locator('#deletePoiHereBtn')).toBeVisible();
  await expect(page.locator('#renamePoiBtn')).toBeVisible();

  await page.locator('#pinSelectedSystemBtn').click();
  await expect(page.locator('#selectedSystemPinState')).toContainText('Pinned: Yes');

  await page.locator('#rerollSelectedSystemBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('Rerolled POI');

  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept('Test POI Rename')),
    page.locator('#renamePoiBtn').click()
  ]);
  await expect(page.locator('#statusMessage')).toContainText('Renamed POI');
  await expect(page.locator('#emptyDetails')).toContainText('Test POI Rename');

  await page.locator('#deletePoiHereBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('Deleted POI');
  const poiCountAfterDelete = await page.locator('polygon.deep-space-poi-marker').count();
  expect(poiCountAfterDelete).toBe(poiCountBefore);
});

test('neighbor sector generation is independent from adjacent sectors', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#modeSizeCustomBtn').click();
  await page.locator('#gridWidth').fill('3');
  await page.locator('#gridHeight').fill('3');
  await page.locator('#modeManualBtn').click();
  await page.locator('#manualMin').fill('0');
  await page.locator('#manualMax').fill('0');
  await page.locator('#generateSectorBtn').click();

  await page.locator('#editModeToggleBtn').click();
  await expect(page.locator('#editModeToggleBtn')).toContainText('EDIT MODE: ON');
  await page.locator('.hex-group[data-id="2-1"]').click();
  await page.locator('#addSystemHereBtn').click();
  await expect(page.locator('#statusTotalSystems')).toHaveText('1 Systems');

  await page.evaluate(() => {
    const currentLabel = document.getElementById('currentSectorLabel');
    const sourceSectorKey = String(currentLabel?.textContent || '').replace('Current:', '').trim();
    window.dispatchEvent(new CustomEvent('requestMoveSectorEdge', {
      detail: { sourceSectorKey, direction: 'east' }
    }));
  });

  await expect(page.locator('#statusTotalSystems')).toHaveText('0 Systems');
  await expect(page.locator('.hex-group[data-id="0-1"] circle.star-circle')).toHaveCount(0);
});

test('linked jump-gates share the same displayed details', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  await page.evaluate(() => {
    const autoKey = 'hex-star-sector-gen:autosave';
    const manualKey = 'hex-star-sector-gen:manual';
    const raw = window.localStorage.getItem(autoKey);
    if (!raw) throw new Error('Missing autosave payload.');
    const payload = JSON.parse(raw);

    const sourceKey = payload.multiSector?.currentKey || 'NNNN';
    const targetKey = sourceKey === 'NNNN' ? 'NNNO' : 'NNNN';
    const pairId = 'jg-shared-profile-test';
    const sourceHexId = '1-1';
    const targetHexId = '0-0';

    const sourceRecord = payload.multiSector.sectorsByKey[sourceKey];
    if (!sourceRecord) throw new Error('Missing source sector record.');
    sourceRecord.sectors = {};
    sourceRecord.systemCount = 0;
    sourceRecord.deepSpacePois = {
      [sourceHexId]: {
        kind: 'Navigation',
        name: 'Active Jump-Gate SourceName',
        summary: 'Source Summary',
        risk: 'Severe',
        rewardHint: 'Source Reward',
        jumpGateState: 'active',
        jumpGatePairId: pairId,
        jumpGateLink: { sectorKey: targetKey, hexId: targetHexId }
      }
    };

    payload.multiSector.sectorsByKey[targetKey] = {
      seed: `${payload.seed || 'sector'} / ${targetKey}`,
      config: sourceRecord.config,
      sectors: {},
      deepSpacePois: {
        [targetHexId]: {
          kind: 'Navigation',
          name: 'Active Jump-Gate TargetName',
          summary: 'Target Summary',
          risk: 'Low',
          rewardHint: 'Target Reward',
          jumpGateState: 'active',
          jumpGatePairId: pairId,
          jumpGateLink: { sectorKey: sourceKey, hexId: sourceHexId }
        }
      },
      pinnedHexIds: [],
      totalHexes: sourceRecord.totalHexes,
      systemCount: 0
    };

    payload.multiSector.jumpGateRegistry = {
      [pairId]: {
        a: { sectorKey: sourceKey, hexId: sourceHexId },
        b: { sectorKey: targetKey, hexId: targetHexId }
      }
    };
    payload.multiSector.currentKey = sourceKey;
    payload.multiSector.selectedSectorKey = sourceKey;
    payload.sectors = {};
    payload.deepSpacePois = sourceRecord.deepSpacePois;
    payload.stats.totalSystems = 0;

    window.localStorage.setItem(manualKey, JSON.stringify(payload));
  });

  await page.locator('#loadSectorLocalBtn').click();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('requestSwitchSectorHex', {
      detail: { sectorKey: 'NNNO', hexId: '0-0' }
    }));
  });

  const synced = await page.evaluate(() => {
    const raw = window.localStorage.getItem('hex-star-sector-gen:autosave');
    if (!raw) return null;
    const payload = JSON.parse(raw);
    const pair = payload.multiSector?.jumpGateRegistry?.['jg-shared-profile-test'];
    if (!pair || !pair.a || !pair.b) return null;
    const source = payload.multiSector?.sectorsByKey?.[pair.a.sectorKey]?.deepSpacePois?.[pair.a.hexId];
    const target = payload.multiSector?.sectorsByKey?.[pair.b.sectorKey]?.deepSpacePois?.[pair.b.hexId];
    if (!source || !target) return null;
    const fields = ['kind', 'name', 'summary', 'risk', 'rewardHint'];
    const allEqual = fields.every((field) => String(source[field] || '') === String(target[field] || ''));
    return { allEqual, source, target };
  });

  expect(synced).toBeTruthy();
  expect(synced.allEqual).toBeTruthy();
});
