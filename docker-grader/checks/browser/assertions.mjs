export async function checkElement(page, contract) {
  const locator = page.locator(contract.selector);
  const count = await locator.count();
  if (contract.count !== undefined) {
    ensure(
      count === contract.count,
      `${checkLabel(contract)}: ожидалось элементов: ${contract.count}, найдено: ${count}.`,
    );
  }
  if (contract.minCount !== undefined) {
    ensure(
      count >= contract.minCount,
      `${checkLabel(contract)}: ожидалось не менее ${contract.minCount} элементов, найдено: ${count}.`,
    );
  }
  const requiresTarget =
    contract.visible ||
    contract.textPattern ||
    contract.pseudoContent ||
    Object.keys(contract.attributes ?? {}).length > 0 ||
    Object.keys(contract.css ?? {}).length > 0;
  ensure(
    !requiresTarget || count > 0,
    `${checkLabel(contract)}: элемент не найден в DOM. Проверьте HTML-разметку и selector.`,
  );

  const targets = contract.all ? await locator.all() : [locator.first()];
  for (const [index, target] of targets.entries()) {
    const targetLabel = checkLabel(contract, contract.all ? index : undefined);
    if (contract.visible) {
      ensure(
        await target.isVisible(),
        `${targetLabel}: элемент найден, но не отображается на странице. Проверьте display, visibility, opacity и размеры элемента.`,
      );
    }
    if (contract.textPattern) {
      const text = (await target.textContent()) ?? '';
      const pattern = new RegExp(contract.textPattern, contract.textFlags);
      ensure(
        pattern.test(text),
        `${targetLabel}: текст не соответствует шаблону ${pattern}. Получено: ${formatValue(compact(text))}.`,
      );
    }
    for (const [attribute, expected] of Object.entries(contract.attributes ?? {})) {
      const actual = await target.getAttribute(attribute);
      ensure(
        actual === expected,
        `${targetLabel}: неверное значение атрибута ${formatValue(attribute)}. Ожидалось: ${formatValue(expected)}. Получено: ${formatValue(actual)}.`,
      );
    }
    for (const [property, expected] of Object.entries(contract.css ?? {})) {
      await checkCssValue(target, property, expected, targetLabel);
    }
  }

  if (contract.pseudoContent) {
    const contents = await locator.evaluateAll(
      (elements, pseudo) =>
        elements.map((item) => getComputedStyle(item, pseudo).getPropertyValue('content')),
      contract.pseudoContent,
    );
    ensure(
      contents.some((content) => !['', 'none', 'normal', '""'].includes(content)),
      `${checkLabel(contract)}: псевдоэлемент ${formatValue(contract.pseudoContent)} не создаёт содержимое. Добавьте CSS-свойство content.`,
    );
  }
}

export async function checkInteraction(page, contract) {
  const locator = page.locator(contract.selector).first();
  ensure(
    (await locator.count()) > 0,
    `${checkLabel(contract)}: элемент для действия ${formatValue(contract.action)} не найден.`,
  );
  const before = Object.fromEntries(
    await Promise.all(
      (contract.changesCss ?? []).map(async (property) => [
        property,
        await cssValue(locator, property),
      ]),
    ),
  );

  if (contract.action === 'hover') {
    await locator.hover();
  } else if (contract.action === 'focus') {
    await locator.focus();
  } else {
    throw new Error(
      `${checkLabel(contract)}: grader не поддерживает действие ${formatValue(contract.action)}.`,
    );
  }

  for (const [property, expected] of Object.entries(contract.css ?? {})) {
    await checkCssValue(
      locator,
      property,
      expected,
      `${checkLabel(contract)} после действия ${formatValue(contract.action)}`,
    );
  }
  for (const property of contract.changesCss ?? []) {
    const after = await cssValue(locator, property);
    ensure(
      after !== before[property],
      `${checkLabel(contract)}: CSS-свойство ${formatValue(property)} должно измениться после действия ${formatValue(contract.action)}. До действия: ${formatValue(before[property])}. После действия: ${formatValue(after)}.`,
    );
  }
}

async function checkCssValue(locator, property, expected, label) {
  const actual = await cssValue(locator, property);
  // A single required family names the primary font; fallback fonts are allowed.
  const matches =
    property === 'font-family' && !expected.includes(',')
      ? primaryFontFamily(actual) === primaryFontFamily(expected)
      : actual === expected;
  ensure(
    matches,
    `${label}: неверное значение CSS-свойства ${formatValue(property)}. Ожидалось: ${formatValue(expected)}. Получено: ${formatValue(actual)}.`,
  );
}

function primaryFontFamily(value) {
  const match = value.trim().match(/^(?:"([^"]+)"|'([^']+)'|([^,"']+))\s*(?:,|$)/);
  return match ? (match[1] ?? match[2] ?? match[3]).trim().toLowerCase() : null;
}

export async function cssValue(locator, property) {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

function checkLabel(contract, index) {
  const matchedElement = index === undefined ? '' : `, элемент №${index + 1}`;
  return `Проверка «${contract.name}» (selector: ${formatValue(contract.selector)}${matchedElement})`;
}

function compact(value) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatValue(value) {
  return value === null ? 'null' : JSON.stringify(String(value));
}
