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
  const endHex = populatedHexes.nth(1);

  await startHex.click({ modifiers: ['Shift'] });
  await endHex.click({ modifiers: ['Shift'] });

  await expect(page.locator('#mapViewport polyline')).toHaveCount(1);
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
