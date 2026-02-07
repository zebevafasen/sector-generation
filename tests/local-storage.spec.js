const { test, expect } = require('@playwright/test');

test('local save/load restores previous sector state', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const beforeSystemsText = await page.locator('#statusTotalSystems').innerText();
  const beforeSystems = Number((beforeSystemsText.match(/(\d+)/) || [0, 0])[1]);
  expect(beforeSystems).toBeGreaterThan(0);

  await page.locator('#saveSectorLocalBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('saved', { ignoreCase: true });

  const populatedHex = page.locator('.hex-group').filter({ has: page.locator('circle.star-circle') }).first();
  await populatedHex.click();
  await page.locator('#editModeToggleBtn').click();
  await page.locator('#editDeleteSystemBtn').click();

  const modifiedSystemsText = await page.locator('#statusTotalSystems').innerText();
  const modifiedSystems = Number((modifiedSystemsText.match(/(\d+)/) || [0, 0])[1]);
  expect(modifiedSystems).toBeLessThan(beforeSystems);

  await page.locator('#loadSectorLocalBtn').click();

  const afterSystemsText = await page.locator('#statusTotalSystems').innerText();
  const afterSystems = Number((afterSystemsText.match(/(\d+)/) || [0, 0])[1]);
  expect(afterSystems).toBe(beforeSystems);
});

test('load local falls back when primary saved payload is invalid', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const snapshot = await page.evaluate(() => {
    const raw = window.localStorage.getItem('hex-star-sector-gen:autosave');
    if (!raw) return null;
    return JSON.parse(raw);
  });
  expect(snapshot).toBeTruthy();

  await page.evaluate((payload) => {
    window.localStorage.setItem('hex-star-sector-gen:manual', '{invalid-json');
    window.localStorage.setItem('hex-star-sector-gen', JSON.stringify(payload));
  }, snapshot);

  const before = await page.locator('#statusTotalSystems').innerText();
  await page.locator('#loadSectorLocalBtn').click();
  const after = await page.locator('#statusTotalSystems').innerText();

  expect(after).toBe(before);
  await expect(page.locator('#statusMessage')).toContainText('ignored invalid older save', { ignoreCase: true });
});
