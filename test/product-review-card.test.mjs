import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { loadBrowserContract } from '../docker-grader/contracts/store.mjs';
import { installDomHelpers } from '../docker-grader/checks/browser/dom-helpers.mjs';
import { lab1Suite } from '../docker-grader/checks/browser/labs/lab1.mjs';

let browser;
const contract = await loadBrowserContract(1, 16);

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

async function cardPage(t, { titleTag = 'p', reviewsTag = 'h1', prefix = '' } = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent(`
    <style>
      .card { width: 350px; font-family: Roboto, sans-serif; }
      img { width: 350px; height: 200px; }
      .content { padding: 15px; }
      .title { font-size: 18px; font-weight: 600; }
      .description, li { font-size: 14px; font-weight: 400; }
      .reviews-title { font-size: 16px; font-weight: 700; }
      li { margin-top: 10px; }
      .name { font-weight: 700; }
    </style>
    ${prefix}
    <main><div class="card">
      <img alt="Товар" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
      <div class="content">
        <${titleTag} class="title">Кружка</${titleTag}>
        <p class="description">Керамическая кружка с изображением кота</p>
        <div class="reviews">
          <${reviewsTag} class="reviews-title">Отзывы</${reviewsTag}>
          <ul><li><div class="name">Иван</div><div>Хорошая кружка</div></li></ul>
        </div>
      </div>
    </div></main>
  `);
  await page.evaluate(installDomHelpers);
  return page;
}

async function checkCard(page) {
  for (const step of lab1Suite.createSteps({ contract, page })) {
    await step.operation();
  }
}

for (const [titleTag, reviewsTag] of [
  ['p', 'h1'],
  ['h1', 'h2'],
  ['h4', 'h5'],
  ['div', 'p'],
]) {
  test(`review card accepts product ${titleTag} and reviews ${reviewsTag}`, async (t) => {
    await checkCard(await cardPage(t, { titleTag, reviewsTag }));
  });
}

test('review card ignores unrelated page headings and supports inline title markup', async (t) => {
  const page = await cardPage(t, { prefix: '<h1>Каталог</h1><h2>Отзывы о магазине</h2>' });
  await page.locator('.title').evaluate((element) => {
    element.innerHTML = '<span>Кружка</span> <span>с котом</span>';
  });
  await checkCard(page);
});

test('mentioning reviews in product text does not select that text as the reviews heading', async (t) => {
  const page = await cardPage(t);
  await page.locator('.description').evaluate((element) => {
    element.textContent = 'Кружка с хорошими отзывами';
  });
  await page.locator('.reviews-title').evaluate((element) => {
    element.innerHTML = '<span>Отзывы покупателей</span>';
  });
  await checkCard(page);
});

for (const [name, selector, css, message] of [
  ['card width', '.card', 'width: 340px', /карточка 350px/],
  ['image width', 'img', 'width: 340px', /изображение 350×200/],
  ['image height', 'img', 'height: 190px', /изображение 350×200/],
  ['product font size', '.title', 'font-size: 16px', /название товара.*18px/],
  ['product font family', '.title', 'font-family: Arial', /название товара.*18px/],
  ['product weight', '.title', 'font-weight: 400', /название товара.*18px/],
  ['hidden product title', '.title', 'display: none', /название товара.*18px/],
  ['reviews font size', '.reviews-title', 'font-size: 18px', /Отзывы.*16px/],
  ['reviews font family', '.reviews-title', 'font-family: Arial', /Отзывы.*16px/],
  ['reviews weight', '.reviews-title', 'font-weight: 400', /Отзывы.*16px/],
  ['hidden reviews title', '.reviews-title', 'display: none', /Отзывы/],
]) {
  test(`review card rejects incorrect ${name}`, async (t) => {
    const page = await cardPage(t);
    await page.locator(selector).evaluate((element, style) => {
      element.style.cssText = style;
    }, css);
    await assert.rejects(checkCard(page), message);
  });
}

test('review title cannot substitute for a missing product title', async (t) => {
  const page = await cardPage(t);
  await page.locator('.title').evaluate((element) => element.remove());
  await assert.rejects(checkCard(page), /название товара.*18px/);
});

test('a heading outside the card cannot substitute for the reviews title', async (t) => {
  const page = await cardPage(t, { prefix: '<h1>Отзывы</h1>' });
  await page.locator('.reviews-title').evaluate((element) => element.remove());
  await assert.rejects(checkCard(page), /Отзывы/);
});

test('a review author cannot substitute for a missing product title', async (t) => {
  const page = await cardPage(t);
  await page.locator('.title').evaluate((element) => element.remove());
  await page.locator('.name').evaluate((element) => {
    element.style.fontSize = '18px';
  });
  await assert.rejects(checkCard(page), /название товара.*18px/);
});

test('review card still requires a list with at least one review', async (t) => {
  const page = await cardPage(t);
  await page.locator('ul').evaluate((element) => {
    element.style.minHeight = '1px';
  });
  await page.locator('li').evaluate((element) => element.remove());
  await assert.rejects(checkCard(page), /ожидалось не менее 1/);
});
