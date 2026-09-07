import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkElement, checkInteraction } from '../docker-grader/checks/browser/assertions.mjs';

const productCards = JSON.parse(
  await readFile(new URL('../docker-grader/contracts/lab1/product-cards.json', import.meta.url)),
);

function pageWithCss(css) {
  const target = {
    count: async () => 1,
    evaluate: async (_callback, property) => css[property],
    hover: async () => {},
  };
  return {
    locator: () => ({
      count: async () => 3,
      all: async () => [target, target, target],
      first: () => target,
    }),
  };
}

for (const family of [
  'Arial',
  'Arial, sans-serif',
  'Arial, Helvetica, sans-serif',
  '"Arial", sans-serif',
  "'Arial', sans-serif",
  'arial, sans-serif',
]) {
  test(`product cards accept primary font ${family}`, async () => {
    for (const contract of productCards.elements) {
      await checkElement(pageWithCss({ ...contract.css, 'font-family': family }), contract);
    }
  });
}

for (const family of [
  'Helvetica, Arial, sans-serif',
  'sans-serif',
  'Arial Black, sans-serif',
  '"Arial, Helvetica", sans-serif',
]) {
  test(`product cards reject incorrect primary font ${family}`, async () => {
    for (const contract of productCards.elements) {
      await assert.rejects(
        checkElement(pageWithCss({ ...contract.css, 'font-family': family }), contract),
        /неверное значение CSS-свойства "font-family"/,
      );
    }
  });
}

test('other CSS properties still require exact values', async () => {
  const contract = productCards.elements[0];
  await assert.rejects(
    checkElement(pageWithCss({ ...contract.css, 'font-size': '19px' }), contract),
    /неверное значение CSS-свойства "font-size"/,
  );
});

test('an explicit font stack still requires the entire stack', async () => {
  const contract = { name: 'font stack', selector: 'h3', css: { 'font-family': 'Arial, serif' } };
  await checkElement(pageWithCss(contract.css), contract);
  await assert.rejects(
    checkElement(pageWithCss({ 'font-family': 'Arial, sans-serif' }), contract),
    /неверное значение CSS-свойства "font-family"/,
  );
});

test('interaction CSS checks also accept fallback fonts', async () => {
  await checkInteraction(pageWithCss({ 'font-family': 'Arial, Helvetica, sans-serif' }), {
    name: 'hover font',
    selector: 'h3',
    action: 'hover',
    css: { 'font-family': 'Arial' },
  });
});
