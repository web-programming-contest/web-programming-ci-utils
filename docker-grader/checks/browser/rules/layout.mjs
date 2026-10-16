import { evaluateRule } from './result.mjs';

const validators = new Map([
  ['centered-content', validateCenteredContent],
  ['dialog-centered', validateDialog],
  ['horizontal-cards', validateHorizontalCards],
  ['layered-rectangles', validateLayeredRectangles],
  ['page-layout', validatePageLayout],
]);

export function getLayoutValidator(kind) {
  return validators.get(kind);
}

async function validateLayeredRectangles(page, contract) {
  await evaluateRule(page, contract, () => {
    const { overlap, query, rgb } = globalThis.__courseGrader;
    const byColor = new Map(
      query('div').map((element) => [rgb(getComputedStyle(element).backgroundColor), element]),
    );
    const elements = ['rgb(255,0,0)', 'rgb(0,128,0)', 'rgb(0,0,255)'].map((color) =>
      byColor.get(color),
    );
    if (elements.some((element) => !element)) {
      return { details: 'Не найдены красный, зелёный и синий div-блоки.', pass: false };
    }
    const styles = elements.map((element) => getComputedStyle(element));
    if (
      styles[0].position !== 'absolute' ||
      styles[1].position !== 'relative' ||
      styles[2].position !== 'absolute'
    ) {
      return { details: 'Ожидается position: absolute, relative, absolute.', pass: false };
    }
    if (
      !overlap(elements[0].getBoundingClientRect(), elements[1].getBoundingClientRect()) ||
      !overlap(elements[2].getBoundingClientRect(), elements[1].getBoundingClientRect())
    ) {
      return { details: 'Цветные блоки должны перекрываться.', pass: false };
    }
    const indexes = styles.map((style) => Number.parseInt(style.zIndex, 10));
    const pass =
      indexes.every(Number.isFinite) && indexes[0] < indexes[1] && indexes[1] < indexes[2];
    return { details: pass ? 'ok' : 'Ожидается z-index: красный < зелёный < синий.', pass };
  });
}

async function validateHorizontalCards(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query, visible } = globalThis.__courseGrader;
    const candidates = query('div').filter(
      (item) =>
        item.querySelector('img') && item.querySelector('h1, h2, h3') && item.querySelector('p'),
    );
    // Find the individual cards without relying on class names or image wrappers.
    const cards = candidates.filter(
      (card) => !candidates.some((other) => other !== card && card.contains(other)),
    );
    if (cards.length !== 3) {
      return {
        details: 'Нужны три отдельные div-карточки с изображением, заголовком и описанием.',
        pass: false,
      };
    }

    for (const [index, card] of cards.entries()) {
      const image = [...card.querySelectorAll('img')].find(visible);
      if (!image) {
        return { details: `В карточке №${index + 1} нужно видимое изображение.`, pass: false };
      }
      // CSS width/height honor the author's box-sizing; a DOMRect also adds
      // padding and borders for content-box, which the assignment does not forbid.
      const style = getComputedStyle(image);
      if (Math.abs(number(style.width) - 200) > 1 || Math.abs(number(style.height) - 150) > 1) {
        return {
          details: `Изображение в карточке №${index + 1} должно иметь размер 200×150px. Получено: ${style.width} × ${style.height}.`,
          pass: false,
        };
      }
    }

    const rects = cards
      .map((card) => card.getBoundingClientRect())
      .sort((left, right) => left.left - right.left);
    const sameRow =
      Math.max(...rects.map((rect) => rect.top)) < Math.min(...rects.map((rect) => rect.bottom));
    if (!sameRow) {
      return { details: 'Карточки должны располагаться в одну строку.', pass: false };
    }
    const gaps = [rects[1].left - rects[0].right, rects[2].left - rects[1].right];
    const pass = gaps.every((gap) => Math.abs(gap - 20) <= 1);
    return {
      details: pass
        ? 'ok'
        : `Отступы между карточками должны быть 20px. Получено: ${gaps.map((gap) => `${gap.toFixed(2)}px`).join(', ')}.`,
      pass,
    };
  });
}

async function validatePageLayout(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query, rgb } = globalThis.__courseGrader;
    const elements = [
      'header, [role="banner"], .header',
      'aside, [class*="sidebar"], [class*="aside"]',
      'main, [role="main"], .main',
      'footer, [role="contentinfo"], .footer',
    ].map((selector) => query(selector)[0]);
    if (elements.some((item) => !item)) {
      return { details: 'Нужны заголовок, боковая панель, основная область и футер.', pass: false };
    }
    if (Math.abs(elements[1].getBoundingClientRect().width - 300) > 1) {
      return { details: 'Ширина aside должна быть 300px.', pass: false };
    }
    if (!['flex', 'grid'].includes(getComputedStyle(elements[1].parentElement).display)) {
      return { details: 'Область aside/main должна использовать Flexbox или Grid.', pass: false };
    }
    if (new Set(elements.map((item) => rgb(getComputedStyle(item).backgroundColor))).size < 4) {
      return { details: 'Каждая область должна иметь свой цвет фона.', pass: false };
    }
    const pass = elements.every((item) => number(getComputedStyle(item).borderWidth) === 1);
    return { details: pass ? 'ok' : 'Каждая область должна иметь рамку 1px.', pass };
  });
}

async function validateCenteredContent(page, contract) {
  await evaluateRule(page, contract, () => {
    const { query } = globalThis.__courseGrader;
    const flex = query('div, main, section').find((item) => {
      const style = getComputedStyle(item);
      return (
        style.display === 'flex' &&
        style.justifyContent === 'center' &&
        style.alignItems === 'center'
      );
    });
    const image = query('img').find((item) => getComputedStyle(item).position === 'absolute');
    if (!flex || !image) {
      return { details: 'Нужны Flexbox-центрирование и absolute-изображение.', pass: false };
    }
    const imageRect = image.getBoundingClientRect();
    const parentRect = image.parentElement.getBoundingClientRect();
    const pass =
      Math.abs(imageRect.top - parentRect.top) <= 3 &&
      Math.abs(imageRect.right - parentRect.right) <= 3;
    return { details: pass ? 'ok' : 'Изображение должно быть в правом верхнем углу.', pass };
  });
}

async function validateDialog(page, contract) {
  await evaluateRule(page, contract, () => {
    const { query } = globalThis.__courseGrader;
    const dialog = query('dialog, [role="dialog"], .dialog, .modal')[0];
    if (!dialog) {
      return { details: 'Не найден dialog или role="dialog".', pass: false };
    }
    if (
      !dialog.querySelector('h1, h2, h3') ||
      dialog.textContent.trim().length === 0 ||
      dialog.querySelectorAll('button').length < 2
    ) {
      return { details: 'Диалог должен содержать заголовок, текст и две кнопки.', pass: false };
    }
    const rect = dialog.getBoundingClientRect();
    const pass =
      Math.abs(rect.left + rect.width / 2 - innerWidth / 2) <= 5 &&
      Math.abs(rect.top + rect.height / 2 - innerHeight / 2) <= 5;
    return { details: pass ? 'ok' : 'Диалог должен быть центрирован.', pass };
  });
}
