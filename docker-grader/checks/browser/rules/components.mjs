import { evaluateRule } from './result.mjs';

const validators = new Map([
  ['custom-underline', validateCustomUnderline],
  ['dish-menu', validateDishMenu],
  ['horizontal-nav', validateHorizontalNav],
  ['pagination', validatePagination],
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
      (element) => element.querySelectorAll('a, button').length >= 3,
    );
    if (!container) {
      return { details: 'Не найден блок пагинации минимум с тремя элементами.', pass: false };
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
    const active = container.querySelector('.active, [aria-current="page"]');
    if (!active) {
      return {
        details: 'Активная страница должна иметь class active или aria-current.',
        pass: false,
      };
    }
    const normal = items.find((item) => item !== active);
    const pass =
      !normal ||
      getComputedStyle(active).backgroundColor !== getComputedStyle(normal).backgroundColor;
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

async function validateStatusIcons(page, contract) {
  await evaluateRule(page, contract, () => {
    const { query } = globalThis.__courseGrader;
    const items = query('li');
    if (items.length < 3) {
      return { details: 'Нужны минимум три задачи.', pass: false };
    }
    const contents = items.map(
      (item) =>
        `${getComputedStyle(item, '::before').content}${getComputedStyle(item, '::after').content}`,
    );
    const pass =
      new Set(contents).size >= 3 && contents.every((value) => !value.includes('nonenone'));
    return { details: pass ? 'ok' : 'Нужны три разные иконки через CSS-псевдоэлементы.', pass };
  });
}

async function validateTextClamp(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query } = globalThis.__courseGrader;
    const item = query('p, article, section, div').find((element) => {
      const style = getComputedStyle(element);
      return (
        element.textContent.trim().length >= 80 &&
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
    const nav = query('nav')[0];
    if (!nav) {
      return { details: 'Не найден nav.', pass: false };
    }
    const links = [...nav.querySelectorAll('a')].filter(visible);
    if (
      links.length < 3 ||
      new Set(links.map((item) => Math.round(item.getBoundingClientRect().top))).size !== 1
    ) {
      return { details: 'Минимум три ссылки должны располагаться горизонтально.', pass: false };
    }
    const active = nav.querySelector('.active, [aria-current="page"]');
    if (!active) {
      return { details: 'Активный пункт должен быть явно отмечен.', pass: false };
    }
    const normal = links.find((item) => item !== active && !item.contains(active));
    if (!normal) {
      return { details: 'ok', pass: true };
    }
    const activeStyle = getComputedStyle(active);
    const normalStyle = getComputedStyle(normal);
    const pass =
      activeStyle.color !== normalStyle.color ||
      activeStyle.backgroundColor !== normalStyle.backgroundColor;
    return { details: pass ? 'ok' : 'Активный пункт должен отличаться цветом.', pass };
  });
}

async function validateProductReviewCard(page, contract) {
  await evaluateRule(page, contract, () => {
    const { number, query } = globalThis.__courseGrader;
    const card = query('article, section, div').find(
      (item) =>
        Math.abs(item.getBoundingClientRect().width - 350) <= 1 &&
        item.querySelector('img') &&
        item.querySelector('ul'),
    );
    if (!card) {
      return { details: 'Нужна карточка 350px с изображением и списком отзывов.', pass: false };
    }
    const imageRect = card.querySelector('img').getBoundingClientRect();
    const heading = card.querySelector('h1, h2, h3');
    const style = heading && getComputedStyle(heading);
    const pass =
      Math.abs(imageRect.width - 350) <= 1 &&
      Math.abs(imageRect.height - 200) <= 1 &&
      style?.fontFamily.toLowerCase().includes('roboto') &&
      Math.abs(number(style.fontSize) - 18) <= 0.1 &&
      number(style.fontWeight) >= 600;
    return {
      details: pass ? 'ok' : 'Ожидаются изображение 350×200 и заголовок Roboto 18px semibold.',
      pass,
    };
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
