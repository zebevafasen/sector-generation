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

  await page.locator('#deletePoiHereBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('Deleted POI');
  const poiCountAfterDelete = await page.locator('polygon.deep-space-poi-marker').count();
  expect(poiCountAfterDelete).toBe(poiCountBefore);
});
