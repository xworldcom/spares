
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');
(async () => {
  const base = "http://127.0.0.1:3010";
  const outDir = "/cursor/stores/self/media/round2";
  const tag = "after-285-v2";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base + '/api/auth/login', { waitUntil: 'domcontentloaded' });
  const login = await context.request.post(base + '/api/auth/login', {
    data: { email: 'customer@spares.local', password: 'SparesCustomer1!' },
  });
  const setCookie = login.headers()['set-cookie'];
  if (setCookie) {
    const pairs = setCookie.split(',').map(s => s.trim());
    for (const chunk of pairs) {
      const m = chunk.match(/spares_session=([^;]+)/);
      if (m) {
        await context.addCookies([{
          name: 'spares_session',
          value: m[1],
          domain: '127.0.0.1',
          path: '/',
        }]);
      }
    }
  }
  const machineUrl = base + '/machines/hardware-fixture';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(machineUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, tag + '-phone-machine-3d.png') });
  await page.getByRole('button', { name: 'List' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, tag + '-phone-machine-list.png') });
  const addBtn = page.getByRole('button', { name: 'Add' }).first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, tag + '-phone-after-add.png') });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(outDir, tag + '-phone-tray-after-reload.png'),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'List' }).click();
  await page.waitForTimeout(400);
  const rowBtn = page.locator('[data-parts-bom] button').first();
  if (await rowBtn.count()) {
    await rowBtn.click();
    const more = page.getByRole('button', { name: 'More' });
    if (await more.count()) {
      await more.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, tag + '-phone-part-more-sheet.png') });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(machineUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'List' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, tag + '-desktop-list-view.png') });
  await page.getByRole('button', { name: '3D' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, tag + '-desktop-after-3d-toggle.png') });
  await page.locator('.quote-sheet-grab').first().click({ position: { x: 10, y: 10 } }).catch(() => {});
  await page.waitForTimeout(300);
  const manualPart = page.locator('.manual-quote-part-number').first();
  if (await manualPart.count()) {
    await manualPart.click();
    await page.screenshot({ path: path.join(outDir, tag + '-desktop-part-number-field.png') });
  }
  await fs.writeFile(path.join(outDir, tag + '-proof.json'), JSON.stringify({
    tag,
    base,
    capturedAt: new Date().toISOString(),
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
