// Optional browser review. NODE_PATH can point to a separate Playwright install.
const { chromium } = require('playwright');
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    await page.goto(`file://${resolve('docs/food-remake/review.html')}`);
    if (process.env.PARK_REVIEW_FONT) {
      const font = readFileSync(process.env.PARK_REVIEW_FONT).toString('base64');
      await page.addStyleTag({ content: `@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}body,button{font-family:Review,sans-serif}` });
      await page.evaluate(() => document.fonts.load('16px Review'));
    }
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    assert.equal(await page.locator('article').count(), 17);
    assert.equal(await page.locator('img').count(), 51);
    assert.deepEqual(await page.locator('img').evaluateAll(imgs => imgs.filter(i => !i.naturalWidth).map(i => i.src)), []);
    await page.screenshot({ path: 'docs/food-remake/review-desktop.png', fullPage: true });
    await page.getByRole('button', { name: '어두운 배경' }).click();
    assert.equal(await page.locator('body').getAttribute('class'), 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile review overflows horizontally');
    await page.screenshot({ path: 'docs/food-remake/review-mobile.png', fullPage: true });
    console.log('OK: 17 cards, 51 loaded images, dark background; desktop/mobile screenshots');
  } finally { await browser.close(); }
})();
