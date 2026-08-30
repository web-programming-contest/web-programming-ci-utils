import assert from 'node:assert/strict';

export const lab5Suite = {
  createSteps({ contract, page, pageUrl }) {
    const application = contract.common.application;
    return [
      {
        name: 'Lab5 UI exposes the public test contract',
        operation: () => checkStructure(page, pageUrl, application, contract.variant.required),
      },
      ...contract.variant.scenarios.map((scenario) => ({
        name: scenario.name,
        operation: () => runScenario(page, scenario, application.interactionTimeoutMs),
      })),
    ];
  },
};

async function checkStructure(page, pageUrl, application, requirements) {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  const root = page.locator(application.rootSelector);
  assert.equal(await root.count(), 1, `exactly one ${application.rootSelector} is required`);
  assert.ok(await root.isVisible(), `${application.rootSelector} must be visible`);

  for (const requirement of requirements) {
    const locator = byTestId(page, requirement.testId);
    const count = await locator.count();
    const minimum = requirement.minimum ?? 1;
    assert.ok(
      count >= minimum,
      `[data-testid="${requirement.testId}"] requires at least ${minimum} element(s), found ${count}`,
    );
    if (requirement.visible !== false) {
      assert.ok(
        await locator.first().isVisible(),
        `[data-testid="${requirement.testId}"] must be visible`,
      );
    }
  }
}

async function runScenario(page, scenario, timeoutMs) {
  for (const command of scenario.prepare ?? []) {
    await execute(page, command);
  }

  const before = await Promise.all(
    scenario.expect.map((expectation) => readState(page, expectation)),
  );
  for (const command of scenario.actions) {
    await execute(page, command);
  }

  for (const [index, expectation] of scenario.expect.entries()) {
    await waitForExpectation(page, expectation, before[index], timeoutMs);
  }
}

async function execute(page, command) {
  if (command.type === 'press') {
    await page.keyboard.press(command.key);
    return;
  }
  if (command.type === 'reload') {
    await page.reload({ waitUntil: 'networkidle' });
    return;
  }

  const locator = commandLocator(page, command);
  assert.ok(await locator.count(), `${targetName(command)} does not exist`);
  if (command.type === 'click') {
    await locator.click();
  } else if (command.type === 'fill') {
    await locator.fill(String(command.value));
  } else if (command.type === 'select') {
    await locator.selectOption(String(command.value));
  } else if (command.type === 'drag') {
    const target = byTestId(page, command.targetTestId).first();
    assert.ok(await target.count(), `[data-testid="${command.targetTestId}"] does not exist`);
    await locator.dragTo(target);
  } else {
    throw new Error(`Unsupported lab5 command: ${command.type}`);
  }
}

async function waitForExpectation(page, expectation, before, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let actual;
  do {
    actual = await readState(page, expectation);
    if (satisfies(expectation, before, actual)) {
      return;
    }
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);

  assert.fail(expectationError(expectation, before, actual));
}

function satisfies(expectation, before, actual) {
  if (expectation.type === 'changed' || expectation.type === 'storage-changed') {
    return actual !== before;
  }
  if (expectation.type === 'increased') {
    return actual > before;
  }
  if (expectation.type === 'visible') {
    return actual === true;
  }
  if (expectation.type === 'matches') {
    return new RegExp(expectation.pattern, expectation.flags).test(String(actual));
  }
  throw new Error(`Unsupported lab5 expectation: ${expectation.type}`);
}

async function readState(page, expectation) {
  if (expectation.type === 'storage-changed') {
    return page.evaluate(() =>
      JSON.stringify(
        Object.keys(localStorage)
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      ),
    );
  }

  const locator = commandLocator(page, expectation);
  if (expectation.type === 'visible') {
    return locator.isVisible();
  }
  if (expectation.state === 'count') {
    return locator.count();
  }
  assert.ok(await locator.count(), `${targetName(expectation)} does not exist`);
  if (expectation.state === 'attribute') {
    return locator.getAttribute(expectation.attribute);
  }
  if (expectation.state === 'value') {
    return locator.inputValue();
  }
  if (expectation.state === 'visual') {
    return (await locator.screenshot()).toString('base64');
  }
  return locator.evaluate((element) => element.textContent.trim());
}

function commandLocator(page, descriptor) {
  const locator = descriptor.selector
    ? page.locator(descriptor.selector)
    : byTestId(page, descriptor.testId);
  return locator.nth(descriptor.index ?? 0);
}

function byTestId(page, testId) {
  return page.locator(`[data-testid=${JSON.stringify(testId)}]`);
}

function expectationError(expectation, before, actual) {
  return `${targetName(expectation)}: expectation "${expectation.type}" was not met; before=${JSON.stringify(before)}, actual=${JSON.stringify(actual)}`;
}

function targetName(descriptor) {
  if (descriptor.testId) {
    return `[data-testid="${descriptor.testId}"]`;
  }
  return descriptor.selector ?? 'localStorage';
}
