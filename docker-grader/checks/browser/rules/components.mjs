import { evaluateRule } from './result.mjs';

const validators = new Map([
  ['custom-underline', validateCustomUnderline],
  ['dish-menu', validateDishMenu],
  ['form-spacing', validateFormSpacing],
  ['horizontal-nav', validateHorizontalNav],
  ['pagination', validatePagination],
  ['product-catalog', validateProductCatalog],
  ['product-review-card', validateProductReviewCard],
  ['status-icons', validateStatusIcons],
  ['text-clamp', validateTextClamp],
  ['two-column-form', validateTwoColumnForm],
]);

export function getComponentValidator(kind) {
  return validators.get(kind);
}

async function validatePagination(page, contract) {
  await evaluateRule(page, contract, () => {
    const { query, visible } = globalThis.__courseGrader;
    const container = query('nav, [aria-label*="pag" i], .pagination').find(
      (element) => element.querySelectorAll('a, button').length >= 2,
    );
    if (!container) {
      return { details: 'Не найден блок пагинации минимум с двумя элементами.', pass: false };
    }
    const items = [...container.querySelectorAll('a, button')].filter(visible);
    const bounds = items.reduce(
      (result, item) => {
        const rect = item.getBoundingClientRect();
        return {
          left: Math.min(result.left, rect.left),
          right: Math.max(result.right, rect.right),
        };
      },
      { left: Infinity, right: -Infinity },
    );
    if (Math.abs((bounds.left + bounds.right) / 2 - innerWidth / 2) > 80) {
      return { details: 'Пагинация должна быть выровнена по центру.', pass: false };
    }
    const backgrounds = new Set(items.map((item) => getComputedStyle(item).backgroundColor));
    const pass = backgrounds.size >= 2;
    return { details: pass ? 'ok' : 'Фон активного элемента должен отличаться.', pass };
  });
}

async function validateDishMenu(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query, rgb } = globalThis.__courseGrader;
    const menu = query('ul').find((item) => item.querySelectorAll(':scope > li').length >= 2);
    if (!menu) {
      return { details: 'Не найдено меню ul минимум с двумя пунктами.', pass: false };
    }
    if (Math.abs(menu.getBoundingClientRect().width - 400) > 1) {
      return { details: 'Ширина меню должна быть 400px.', pass: false };
    }
    for (const item of menu.querySelectorAll(':scope > li')) {
      const style = getComputedStyle(item);
      if (!['flex', 'grid'].includes(style.display)) {
        return { details: 'Пункты меню должны использовать Flexbox или Grid.', pass: false };
      }
      if (number(style.borderBottomWidth) !== 1 || rgb(style.borderBottomColor) !== 'rgb(0,0,0)') {
        return { details: 'Пункты должны разделяться чёрной линией 1px.', pass: false };
      }
    }
    return { details: 'ok', pass: true };
  });
}

async function validateFormSpacing(page, contract) {
  await evaluateRule(page, contract, (rule) => {
    const { number, query } = globalThis.__courseGrader;
    const form = query('form')[0];
    if (!form) {
      return { details: 'Не найдена форма.', pass: false };
    }
    const candidates = [form, ...form.querySelectorAll('*')];
    const pass = candidates.some((element) => {
      const style = getComputedStyle(element);
      return [style.rowGap, style.marginTop, style.marginBottom].some(
        (value) => Math.abs(number(value) - rule.spacing) <= 0.1,
      );
    });
    return {
      details: pass
        ? 'ok'
        : `Между полями формы должен быть отступ ${rule.spacing}px через gap или margin.`,
      pass,
    };
  });
}

async function validateTwoColumnForm(page, contract) {
  await evaluateRule(page, contract, () => {
    const { query } = globalThis.__courseGrader;
    const form = query('form')[0];
    if (!form) {
      return { details: 'Не найдена форма.', pass: false };
    }
    const style = getComputedStyle(form);
    if (!['flex', 'grid'].includes(style.display) && !form.querySelector('[class*="row"]')) {
      return { details: 'Форма должна использовать Grid/Flexbox или строки полей.', pass: false };
    }
    const pass = form.querySelectorAll('label').length >= 4;
    return { details: pass ? 'ok' : 'У каждого типа поля должна быть подпись label.', pass };
  });
}

async function validateProductCatalog(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query } = globalThis.__courseGrader;
    const products = query('li li');
    const validProducts = products.filter((product) => {
      const descendants = [product, ...product.querySelectorAll('*')];
      const hasBoldName = descendants.some(
        (element) => number(getComputedStyle(element).fontWeight) >= 600,
      );
      const hasItalicPrice = descendants.some(
        (element) => getComputedStyle(element).fontStyle === 'italic',
      );
      return hasBoldName && hasItalicPrice;
    });
    return {
      details:
        validProducts.length >= 2
          ? 'ok'
          : 'Минимум у двух товаров название должно быть выделено жирным, а цена — курсивом.',
      pass: validProducts.length >= 2,
    };
  });
}

async function validateStatusIcons(page, contract) {
  await evaluateRule(page, contract, () => {
    const { query } = globalThis.__courseGrader;
    const items = query('li');
    if (items.length < 3) {
      return { details: 'Нужны минимум три задачи.', pass: false };
    }
    const pseudoElements = ['::before', '::after', '::marker'];
    const contents = items.map((item) => {
      const content = pseudoElements
        .map((pseudoElement) => getComputedStyle(item, pseudoElement).content)
        .find((value) => !['', 'none', 'normal', '""'].includes(value));
      return content ?? '';
    });
    const pass = new Set(contents).size >= 3 && contents.every(Boolean);
    return { details: pass ? 'ok' : 'Нужны три разные иконки через CSS-псевдоэлементы.', pass };
  });
}

async function validateTextClamp(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query } = globalThis.__courseGrader;
    const item = query('p, article, section, div').find((element) => {
      const style = getComputedStyle(element);
      return (
        style.fontFamily.toLowerCase().includes('arial') &&
        Math.abs(number(style.fontSize) - 16) <= 0.1 &&
        ['hidden', 'clip'].includes(style.overflow) &&
        (style.getPropertyValue('-webkit-line-clamp') === '3' || number(style.maxHeight) <= 100)
      );
    });
    return {
      details: item ? 'ok' : 'Нужен Arial 16px с overflow и лимитом 3 строки/100px.',
      pass: Boolean(item),
    };
  });
}

async function validateHorizontalNav(page, contract) {
  await evaluateRule(page, contract, () => {
    const { query, visible } = globalThis.__courseGrader;
    const nav = query('nav, [role="navigation"], ul, ol, .nav, .menu').find(
      (element) => element.querySelectorAll('a').length >= 2,
    );
    if (!nav) {
      return {
        details: 'Не найден контейнер горизонтального меню минимум с двумя ссылками.',
        pass: false,
      };
    }
    const links = [...nav.querySelectorAll('a')].filter(visible);
    if (
      links.length < 2 ||
      new Set(links.map((item) => Math.round(item.getBoundingClientRect().top))).size !== 1
    ) {
      return { details: 'Ссылки меню должны располагаться горизонтально.', pass: false };
    }
    const styles = new Set(
      links.map((item) => {
        const style = getComputedStyle(item);
        return `${style.color}|${style.backgroundColor}`;
      }),
    );
    const pass = styles.size >= 2;
    return { details: pass ? 'ok' : 'Активный пункт должен отличаться цветом.', pass };
  });
}

async function validateProductReviewCard(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query, visible } = globalThis.__courseGrader;
    const card = query('article, section, div').find(
      (item) =>
        Math.abs(item.getBoundingClientRect().width - 350) <= 1 &&
        item.querySelector('img') &&
        item.querySelector('ul'),
    );
    if (!card) {
      return { details: 'Нужна карточка 350px с изображением и списком отзывов.', pass: false };
    }
    const image = card.querySelector('img');
    const imageRect = image.getBoundingClientRect();
    if (Math.abs(imageRect.width - 350) > 1 || Math.abs(imageRect.height - 200) > 1) {
      return { details: 'Ожидается изображение 350×200.', pass: false };
    }

    // The assignment specifies text and styles, not heading tags or class names.
    // Keep this lookup local to this task; other contracts still use checkElement.
    const textElements = [...card.querySelectorAll('*')].filter(
      (element) =>
        visible(element) &&
        !element.closest('ul') &&
        !element.querySelector('img, ul') &&
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
        ),
    );
    const reviewsTitle = textElements.find((element) =>
      /^отзывы(?:\s|[.:!?(]|$)/i.test(element.textContent.trim()),
    );
    if (!reviewsTitle) {
      return { details: 'В карточке нужен заголовок блока «Отзывы».', pass: false };
    }
    const matchesTitleStyle = (element, size) => {
      const style = getComputedStyle(element);
      return (
        style.fontFamily.toLowerCase().includes('roboto') &&
        Math.abs(number(style.fontSize) - size) <= 0.1 &&
        number(style.fontWeight) >= 600
      );
    };
    if (!matchesTitleStyle(reviewsTitle, 16)) {
      return { details: 'Заголовок «Отзывы» должен быть Roboto 16px semibold.', pass: false };
    }

    const productTitle = textElements.find(
      (element) =>
        !element.contains(reviewsTitle) &&
        Boolean(image.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        Boolean(element.compareDocumentPosition(reviewsTitle) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        matchesTitleStyle(element, 18),
    );
    if (!productTitle) {
      return {
        details: 'Между изображением и отзывами нужно название товара Roboto 18px semibold.',
        pass: false,
      };
    }
    return { details: 'ok', pass: true };
  });
}

async function validateCustomUnderline(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query } = globalThis.__courseGrader;
    const item = query('a, span, p, strong').find((element) => {
      const style = getComputedStyle(element);
      const before = getComputedStyle(element, '::before');
      const after = getComputedStyle(element, '::after');
      return (
        style.textDecorationLine !== 'underline' &&
        (number(style.borderBottomWidth) > 0 ||
          style.backgroundImage !== 'none' ||
          number(before.borderBottomWidth) > 0 ||
          number(after.borderBottomWidth) > 0)
      );
    });
    return {
      details: item ? 'ok' : 'Нужно кастомное подчёркивание без text-decoration.',
      pass: Boolean(item),
    };
  });
}
