const { test, expect } = require('@playwright/test');

test('can generate sector and reroll a selected planet from details panel', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const populatedHex = page.locator('.hex-group').filter({
    has: page.locator('circle.star-circle')
  }).first();
  await populatedHex.click();

  await expect(page.locator('#systemDetails')).toBeVisible();

  const firstPlanet = page.locator('#infoPlanetList li').first();
  await firstPlanet.click();

  await expect(page.locator('#infoBodyDetailsPanel')).toBeVisible();
  await expect(page.locator('#infoBodyDetailsContent')).toBeVisible();
  await expect(page.locator('#rerollBodyBtn')).toBeVisible();

  await page.locator('#rerollBodyBtn').click();

  await expect(page.locator('#infoBodyDetailsPanel')).toBeVisible();
  await expect(page.locator('#infoBodyDetailsContent')).toBeVisible();
  await expect(page.locator('#infoBodyDetailsName')).not.toHaveText('Body');
});
