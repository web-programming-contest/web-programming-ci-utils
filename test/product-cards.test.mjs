import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { loadBrowserContract } from '../docker-grader/contracts/store.mjs';
import { installDomHelpers } from '../docker-grader/checks/browser/dom-helpers.mjs';
import { lab1Suite } from '../docker-grader/checks/browser/labs/lab1.mjs';

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

async function cardsPage(t, { css = '', nested = false, count = 3 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  t.after(() => page.close());
  const cards = Array.from({ length: count }, (_, index) => {
    const image = `<img alt="Товар ${index}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">`;
    const text = `<h3>Товар ${index}</h3><p>Описание товара</p>`;
    return `<div class="product">${nested ? `<div>${image}</div><div>${text}</div>` : image + text}</div>`;
  });
  await page.setContent(`
    <style>
      .catalog { display: flex; flex-wrap: wrap; gap: 20px; }
      .product { padding: 10px; border: 1px solid #ccc; }
      .product img { display: block; width: 200px; height: 150px; padding: 10px; }
      h3, p { margin: 0; padding: 10px; font-family: Arial, sans-serif; }
      h3 { font-size: 18px; font-weight: bold; }
      p { font-size: 14px; }
      ${css}
    </style>
    <div class="catalog">${cards.join('')}</div>
  `);
  await page.evaluate(installDomHelpers);
  return page;
}

async function checkCards(page, variant = 33) {
  const contract = await loadBrowserContract(1, variant);
  for (const step of lab1Suite.createSteps({ contract, page })) {
    await step.operation();
  }
}

for (const variant of [7, 33]) {
  test(`product cards accept 200x150 content with padding for variant ${variant}`, async (t) => {
    await checkCards(await cardsPage(t), variant);
  });
}

test('product cards preserve support for border-box image dimensions', async (t) => {
  const page = await cardsPage(t, { css: '.product img { box-sizing: border-box; }' });
  await checkCards(page);
});

test('image padding, borders and margins do not change the required CSS dimensions', async (t) => {
  const page = await cardsPage(t, {
    css: '.product img { padding: 5px 15px; border: 2px solid black; margin: 3px; }',
  });
  await checkCards(page);
});

test('product cards can contain image and text wrappers', async (t) => {
  await checkCards(await cardsPage(t, { nested: true }));
});

test('unrelated images are not mistaken for product cards', async (t) => {
  const page = await cardsPage(t);
  await page.locator('.catalog').evaluate((catalog) => {
    const logo = catalog.querySelector('img').cloneNode(true);
    logo.style.width = '200px';
    logo.style.height = '150px';
    catalog.before(logo);
  });
  await checkCards(page);
});

test('card margins can provide the required spacing without a flex gap', async (t) => {
  const page = await cardsPage(t, {
    css: '.catalog { gap: 0; } .product + .product { margin-left: 20px; }',
  });
  await checkCards(page);
});

test('product cards use visual order for a reversed flex row', async (t) => {
  const page = await cardsPage(t, { css: '.catalog { flex-direction: row-reverse; }' });
  await checkCards(page);
});

test('a horizontal row can contain cards of different heights aligned at their centers', async (t) => {
  const page = await cardsPage(t, {
    css: '.catalog { align-items: center; } .product:first-child p { height: 60px; }',
  });
  await checkCards(page);
});

for (const [name, css] of [
  ['zero gap', '.catalog { gap: 0; }'],
  ['oversized gap', '.catalog { gap: 100px; }'],
  ['unequal gaps', '.product:last-child { margin-left: 10px; }'],
  ['distributed extra space', '.catalog { justify-content: space-between; }'],
]) {
  test(`product cards reject ${name}, even with correctly sized border-box images`, async (t) => {
    const page = await cardsPage(t, {
      css: `.product img { box-sizing: border-box; } ${css}`,
    });
    await assert.rejects(checkCards(page), /[Оо]тступ.*20px/);
  });
}

test('vertically stacked cards are not a horizontal row', async (t) => {
  const page = await cardsPage(t, { css: '.catalog { flex-direction: column; }' });
  await assert.rejects(checkCards(page), /в одну строку/);
});

for (const [property, value] of [
  ['width', '190px'],
  ['height', '140px'],
]) {
  test(`product cards reject an incorrect image ${property}`, async (t) => {
    const page = await cardsPage(t, { css: `.product:last-child img { ${property}: ${value}; }` });
    await assert.rejects(checkCards(page), /200×150px/);
  });
}

for (const count of [2, 4]) {
  test(`product cards require three distinct cards, not ${count}`, async (t) => {
    const page = await cardsPage(t, { count });
    const contract = await loadBrowserContract(1, 33);
    const step = lab1Suite
      .createSteps({ contract, page })
      .find((item) => item.name === 'three horizontal cards');
    await assert.rejects(step.operation(), /три.*div/);
  });
}

test('three images inside one card cannot substitute for three cards', async (t) => {
  const page = await cardsPage(t, { count: 1 });
  await page.locator('.product').evaluate((card) => {
    card.append(
      card.querySelector('img').cloneNode(true),
      card.querySelector('img').cloneNode(true),
    );
  });
  const contract = await loadBrowserContract(1, 33);
  const step = lab1Suite
    .createSteps({ contract, page })
    .find((item) => item.name === 'three horizontal cards');
  await assert.rejects(step.operation(), /три.*div/);
});
