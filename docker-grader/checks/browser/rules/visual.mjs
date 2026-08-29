import assert from 'node:assert/strict';
import { cssValue } from '../assertions.mjs';
import { evaluateRule } from './result.mjs';

const validators = new Map([
  ['flag', validateFlag],
  ['hover-card', validateHoverCard],
]);

export function getVisualValidator(kind) {
  return validators.get(kind);
}

async function validateFlag(page, contract) {
  await evaluateRule(page, contract, (rule) => {
    const { colorMatches, number, query } = globalThis.__courseGrader;
    const circle = query('div, span').find((item) => {
      const style = getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      return (
        style.position === 'absolute' &&
        Math.abs(rect.width - rect.height) <= 2 &&
        number(style.borderRadius) >= rect.width / 2 - 1 &&
        colorMatches(style.backgroundColor, rule.circleColor)
      );
    });
    if (!circle?.parentElement) {
      return { details: 'Не найден абсолютный круг нужного цвета.', pass: false };
    }
    const outer = circle.parentElement;
    const innerRect = circle.getBoundingClientRect();
    const outerRect = outer.getBoundingClientRect();
    const centered =
      Math.abs(innerRect.left + innerRect.width / 2 - (outerRect.left + outerRect.width / 2)) <=
        3 &&
      Math.abs(innerRect.top + innerRect.height / 2 - (outerRect.top + outerRect.height / 2)) <= 3;
    if (!centered) {
      return { details: 'Круг должен находиться точно в центре флага.', pass: false };
    }
    const pass =
      !rule.backgroundColor ||
      colorMatches(getComputedStyle(outer).backgroundColor, rule.backgroundColor);
    return { details: pass ? 'ok' : `Фон флага должен иметь цвет ${rule.backgroundColor}.`, pass };
  });
}

async function validateHoverCard(page, contract) {
  const result = await evaluateRule(page, contract, () => {
    const { mark, query } = globalThis.__courseGrader;
    const card = query('article, section, div').find((item) => item.querySelector('img'));
    if (!card) {
      return { details: 'Не найдена карточка с изображением.', pass: false };
    }
    return {
      cardSelector: mark(card),
      details: 'ok',
      imageSelector: mark(card.querySelector('img')),
      pass: true,
    };
  });
  const card = page.locator(result.cardSelector);
  const image = page.locator(result.imageSelector);
  const previousShadow = await cssValue(card, 'box-shadow');
  await card.hover();
  assert.equal(
    await cssValue(card, 'background-color'),
    'rgb(224, 247, 250)',
    'Hover must change the card background.',
  );
  assert.notEqual(
    await cssValue(card, 'box-shadow'),
    previousShadow,
    'Hover must add a card shadow.',
  );
  assert.notEqual(await cssValue(image, 'transform'), 'none', 'Hover must scale the image.');
}
