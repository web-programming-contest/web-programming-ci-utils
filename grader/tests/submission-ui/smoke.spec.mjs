import { expect, test } from '@playwright/test';

const lab = Number(process.env.COURSE_LAB);
const variant = Number(process.env.COURSE_VARIANT);

test('page loads without browser errors and exposes meaningful UI', async ({ page }) => {
  const errors = [];
  const failedLocalResources = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400) {
      failedLocalResources.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/index.html', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toBeVisible();
  await expect(page).toHaveTitle(/\S/);

  const meaningfulElements = page.locator(
    'main, nav, form, article, section, button, input, textarea, select, canvas, [role]',
  );
  await expect(
    meaningfulElements.first(),
    'Page must contain semantic or interactive UI',
  ).toBeVisible();

  await page.screenshot({ fullPage: true, path: test.info().outputPath('diagnostic.png') });
  expect(failedLocalResources, 'All local CSS, JS, images and fonts must load').toEqual([]);
  expect(errors, 'Browser console must not contain errors').toEqual([]);
});

test('layout fits the standard desktop viewport', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'networkidle' });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2);
});

test('lab1 variant 1 implements the registration form contract', async ({ page }) => {
  test.skip(lab !== 1 || variant !== 1, 'This scenario belongs to lab1 variant 1.');

  await page.goto('/index.html', { waitUntil: 'networkidle' });
  const form = page.locator('form');
  const name = page.locator('input[name="name"]');
  const email = page.locator('input[name="email"]');
  const button = page.getByRole('button', { name: /зарегистрироваться/i });

  await expect(form).toBeVisible();
  await expect(form).toHaveCSS('width', '400px');
  await expect(form).toHaveCSS('padding-top', '8px');
  await expect(name).toHaveAttribute('required', '');
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('required', '');
  await expect(button).toHaveCSS('background-color', 'rgb(0, 86, 255)');
  await button.hover();
  await expect(button).toHaveCSS('background-color', 'rgb(65, 127, 251)');
});
