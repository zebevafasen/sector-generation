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

test('renaming a system can rename linked planet names', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const populatedHex = page.locator('.hex-group').filter({
    has: page.locator('circle.star-circle')
  }).first();
  await populatedHex.click();

  await expect(page.locator('#systemDetails')).toBeVisible();

  const newSystemName = 'Renamed Test System';
  page.on('dialog', async (dialog) => {
    const message = dialog.message();
    if (message.startsWith('Rename system')) {
      await dialog.accept(newSystemName);
      return;
    }
    if (message.startsWith('Also rename linked planets/objects')) {
      await dialog.accept();
      return;
    }
    await dialog.dismiss();
  });

  const firstPlanetNameBefore = (await page.locator('#infoPlanetList li .inline-flex.items-center.gap-2').first().innerText()).trim();
  await page.locator('#renameSystemBtn').click();

  await expect(page.locator('#infoSystemName')).toHaveText(newSystemName);

  const firstPlanetNameAfter = (await page.locator('#infoPlanetList li .inline-flex.items-center.gap-2').first().innerText()).trim();
  if (firstPlanetNameBefore.includes(' ')) {
    await expect(firstPlanetNameAfter.startsWith(`${newSystemName} `)).toBeTruthy();
  }
});

test('reroll unpinned keeps system layout positions stable', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const beforeHexes = await page.locator('.hex-group:has(circle.star-circle)').evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute('data-id'))
      .filter(Boolean)
      .sort()
  );
  await expect(beforeHexes.length).toBeGreaterThan(0);

  await page.locator('#rerollUnpinnedBtn').click();

  const afterHexes = await page.locator('.hex-group:has(circle.star-circle)').evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute('data-id'))
      .filter(Boolean)
      .sort()
  );

  expect(afterHexes).toEqual(beforeHexes);
});
