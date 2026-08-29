import assert from 'node:assert/strict';

export async function checkElement(page, contract) {
  const locator = page.locator(contract.selector);
  const count = await locator.count();
  if (contract.count !== undefined) {
    assert.equal(count, contract.count, `${contract.name}: element count`);
  }
  if (contract.minCount !== undefined) {
    assert.ok(
      count >= contract.minCount,
      `${contract.name}: minimum count is ${contract.minCount}`,
    );
  }

  const targets = contract.all ? await locator.all() : [locator.first()];
  for (const target of targets) {
    if (contract.visible) {
      assert.ok(await target.isVisible(), `${contract.name}: element must be visible`);
    }
    if (contract.textPattern) {
      const text = (await target.textContent()) ?? '';
      assert.match(text, new RegExp(contract.textPattern, contract.textFlags), contract.name);
    }
    for (const [name, value] of Object.entries(contract.attributes ?? {})) {
      assert.equal(await target.getAttribute(name), value, `${contract.name}: attribute ${name}`);
    }
    for (const [name, value] of Object.entries(contract.css ?? {})) {
      assert.match(await cssValue(target, name), new RegExp(`^(?:${value})$`), contract.name);
    }
  }

  if (contract.pseudoContent) {
    const contents = await locator.evaluateAll(
      (elements, pseudo) =>
        elements.map((item) => getComputedStyle(item, pseudo).getPropertyValue('content')),
      contract.pseudoContent,
    );
    assert.ok(
      contents.some((content) => !['', 'none', 'normal', '""'].includes(content)),
      `${contract.name}: ${contract.pseudoContent} must generate content`,
    );
  }
}

export async function checkInteraction(page, contract) {
  const locator = page.locator(contract.selector).first();
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
    throw new Error(`Unsupported browser action: ${contract.action}`);
  }

  for (const [name, value] of Object.entries(contract.css ?? {})) {
    assert.match(await cssValue(locator, name), new RegExp(`^(?:${value})$`), contract.name);
  }
  for (const property of contract.changesCss ?? []) {
    assert.notEqual(
      await cssValue(locator, property),
      before[property],
      `${contract.name}: ${property} must change`,
    );
  }
}

export async function cssValue(locator, property) {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}
