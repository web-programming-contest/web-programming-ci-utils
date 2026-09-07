import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { installDomHelpers } from '../docker-grader/checks/browser/dom-helpers.mjs';
import { checkRule } from '../docker-grader/checks/browser/rules/index.mjs';

let browser;

before(async () => {
  browser = await chromium.launch({
    args: ['--disable-crash-reporter', '--disable-crashpad-for-testing'],
    ...(process.env.COURSE_CHROMIUM_PATH
      ? { executablePath: process.env.COURSE_CHROMIUM_PATH }
      : {}),
  });
});

after(async () => {
  await browser?.close();
});

async function cardPage(
  t,
  {
    transition = '0.3s',
    background = '#e0f7fa',
    shadow = '5px 5px 10px rgb(0 0 0 / 0.2)',
    transform = 'scale(1.1)',
  } = {},
) {
  const page = await browser.newPage();
  t.after(() => page.close());
  page.setDefaultTimeout(1500);
  await page.setContent(`
    <style>
      article { width: 300px; margin: 40px; padding: 20px; background: white; }
      article, img { transition: ${transition}; }
      img { display: block; width: 200px; height: 200px; }
      article:hover { background-color: ${background}; box-shadow: ${shadow}; }
      article:hover img { transform: ${transform}; }
    </style>
    <article>
      <img alt="Product" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
      <h1>Product</h1><p>100</p>
    </article>
  `);
  await page.evaluate(installDomHelpers);
  return page;
}

const contract = { name: 'card hover effects', kind: 'hover-card' };

for (const transition of ['none', '0.3s', '0.3s 0.4s']) {
  test(`hover card accepts transition: ${transition}`, async (t) => {
    const page = await cardPage(t, { transition });
    await checkRule(page, contract);
    assert.equal(
      await page.locator('article').evaluate((card) => getComputedStyle(card).backgroundColor),
      'rgb(224, 247, 250)',
    );
  });
}

for (const [property, value, message] of [
  ['background', 'white', 'Hover must change the card background.'],
  ['shadow', 'none', 'Hover must add a card shadow.'],
  ['transform', 'none', 'Hover must scale the image.'],
]) {
  test(`hover card rejects missing ${property} effect`, async (t) => {
    const page = await cardPage(t, { [property]: value });
    await assert.rejects(checkRule(page, contract), (error) => {
      assert.ok(error.message.includes(message), error.message);
      return true;
    });
  });
}
