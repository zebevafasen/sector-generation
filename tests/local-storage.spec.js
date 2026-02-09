const { test, expect } = require('@playwright/test');

function parseViewportScale(transform) {
  const match = String(transform || '').match(/scale\(([-\d.]+)\)/);
  return match ? Number(match[1]) : 1;
}

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

test('save/load uses active size mode dimensions and ignores stale custom inputs', async ({ page }) => {
  await page.goto('/sector_generator.html');

  await page.locator('#modeSizeCustomBtn').click();
  await page.locator('#gridWidth').fill('24');
  await page.locator('#gridHeight').fill('24');

  await page.locator('#modeSizePresetBtn').click();
  await page.locator('#sizePreset').selectOption('standard'); // 8 x 10
  await page.locator('#generateSectorBtn').click();

  await expect(page.locator('#statusTotalHexes')).toContainText('80 Hexes');
  await page.locator('#saveSectorLocalBtn').click();
  await page.locator('#loadSectorLocalBtn').click();
  await expect(page.locator('#statusTotalHexes')).toContainText('80 Hexes');
  await expect(page.locator('.hex-group')).toHaveCount(80);
});

test('load local restores expanded view rendering without extra sector clicks', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  await page.evaluate(() => {
    const currentLabel = document.getElementById('currentSectorLabel');
    const sourceSectorKey = String(currentLabel?.getAttribute('data-sector-key') || '').trim()
      || String(currentLabel?.textContent || '').replace('Current:', '').trim();
    window.dispatchEvent(new CustomEvent('requestMoveSectorEdge', {
      detail: { sourceSectorKey, direction: 'east' }
    }));
  });
  await page.locator('#toggleExpandedSectorViewBtn').click();
  await expect(page.locator('#toggleExpandedSectorViewBtn')).toContainText('Expanded View: On');
  await expect(page.locator('.sector-layer')).toHaveCount(2);

  await page.locator('#saveSectorLocalBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('saved', { ignoreCase: true });

  await page.locator('#toggleExpandedSectorViewBtn').click();
  await expect(page.locator('#toggleExpandedSectorViewBtn')).toContainText('Expanded View: Off');

  await page.locator('#loadSectorLocalBtn').click();
  await expect(page.locator('#toggleExpandedSectorViewBtn')).toContainText('Expanded View: On');
  await expect(page.locator('.sector-layer')).toHaveCount(2);
});

test('save/load preserves map zoom level', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const mapContainer = page.locator('#mapContainer');
  await mapContainer.hover();
  await page.mouse.wheel(0, -1200);

  const zoomedTransform = await page.locator('#mapViewport').getAttribute('transform');
  const zoomedScale = parseViewportScale(zoomedTransform);
  expect(zoomedScale).toBeGreaterThan(1);

  await page.locator('#saveSectorLocalBtn').click();
  await page.locator('#loadSectorLocalBtn').click();

  const restoredTransform = await page.locator('#mapViewport').getAttribute('transform');
  const restoredScale = parseViewportScale(restoredTransform);
  expect(Math.abs(restoredScale - zoomedScale)).toBeLessThan(0.02);
});

test('reload restores autosaved zoom level', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const mapContainer = page.locator('#mapContainer');
  await mapContainer.hover();
  await page.mouse.wheel(0, -1000);

  const zoomedTransform = await page.locator('#mapViewport').getAttribute('transform');
  const zoomedScale = parseViewportScale(zoomedTransform);
  expect(zoomedScale).toBeGreaterThan(1);

  await page.reload();
  await expect(page.locator('#statusTotalHexes')).toContainText('Hexes');
  const restoredTransform = await page.locator('#mapViewport').getAttribute('transform');
  const restoredScale = parseViewportScale(restoredTransform);
  expect(Math.abs(restoredScale - zoomedScale)).toBeLessThan(0.05);
});

test('manual core system set in edit mode persists across save/load', async ({ page }) => {
  const clickHex = async (hexId) => {
    await page.evaluate((targetHexId) => {
      const node = document.querySelector(`#mapViewport .hex-group[data-id="${targetHexId}"]`);
      if (!node) throw new Error(`Hex ${targetHexId} not found`);
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, hexId);
  };

  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  const coreHexId = await page.locator('.hex-group').filter({
    has: page.locator('circle.star-circle')
  }).first().getAttribute('data-id');
  expect(coreHexId).toBeTruthy();

  await clickHex(coreHexId);
  await page.locator('#editModeToggleBtn').click();
  await expect(page.locator('#editModeToggleBtn')).toContainText('EDIT MODE: ON');
  const ensureCoreSelected = async () => {
    const readState = async () => page.locator('#selectedSystemCoreState').innerText();
    let stateText = await readState();
    if (/Core:\s*Yes/i.test(stateText)) return;
    await page.locator('#setCoreSystemBtn').click();
    stateText = await readState();
    if (/Core:\s*Yes/i.test(stateText)) return;
    await page.locator('#setCoreSystemBtn').click();
  };
  await ensureCoreSelected();
  await expect(page.locator('#selectedSystemCoreState')).toContainText('Core: Yes');
  await expect(page.locator(`#mapViewport .hex-group[data-id="${coreHexId}"] .core-system-marker`)).toHaveCount(1);

  await page.locator('#saveSectorLocalBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('saved', { ignoreCase: true });

  await page.locator('#generateSectorBtn').click();
  await page.locator('#loadSectorLocalBtn').click();

  await clickHex(coreHexId);
  await expect(page.locator('#selectedSystemCoreState')).toContainText('Core: Yes');
  await expect(page.locator(`#mapViewport .hex-group[data-id="${coreHexId}"] .core-system-marker`)).toHaveCount(1);
});

test('reload preserves faction overlay menu option', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  await page.locator('#factionOverlayModeSelect').selectOption('contested');
  await expect(page.locator('#factionOverlayModeSelect')).toHaveValue('contested');

  await page.reload();
  await expect(page.locator('#factionOverlayModeSelect')).toHaveValue('contested');
});

test('generate preserves faction overlay menu option', async ({ page }) => {
  await page.goto('/sector_generator.html');
  await page.locator('#generateSectorBtn').click();

  await page.locator('#factionOverlayModeSelect').selectOption('off');
  await expect(page.locator('#factionOverlayModeSelect')).toHaveValue('off');

  await page.locator('#generateSectorBtn').click();
  await expect(page.locator('#factionOverlayModeSelect')).toHaveValue('off');
});
