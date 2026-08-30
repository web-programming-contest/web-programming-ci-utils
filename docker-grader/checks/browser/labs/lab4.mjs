import assert from 'node:assert/strict';

function installAsyncProbe() {
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  globalThis.__courseAsyncProbe = { timeoutCalls: 0 };
  globalThis.setTimeout = (callback, delay, ...arguments_) => {
    globalThis.__courseAsyncProbe.timeoutCalls += 1;
    return nativeSetTimeout(callback, delay, ...arguments_);
  };
}

function createLab4Scenario(page, pageUrl, application, ui) {
  let initialCount;

  return {
    async checkStructure() {
      await page.goto(pageUrl, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });

      const list = page.locator(application.listSelector);
      const form = page.locator(application.formSelector);
      assert.equal(await list.count(), 1, 'exactly one entity list is required');
      assert.equal(await form.count(), 1, 'exactly one entity creation form is required');
      assert.ok(await form.isVisible(), 'entity creation form must be visible');

      for (const name of Object.keys(ui.fields)) {
        const control = form.locator(`[name=${JSON.stringify(name)}]`);
        assert.equal(await control.count(), 1, `form control [name="${name}"] is required`);
      }
      assert.ok(
        (await form
          .locator('button:not([type]), button[type="submit"], input[type="submit"]')
          .count()) > 0,
        'entity form must have a submit control',
      );
      initialCount = await page.locator(application.cardSelector).count();
    },

    async addEntity() {
      const form = page.locator(application.formSelector);
      for (const [name, value] of Object.entries(ui.fields)) {
        await fillControl(form.locator(`[name=${JSON.stringify(name)}]`), value);
      }

      const immediate = await page.evaluate(
        ({ cardSelector, formSelector }) => {
          const before = document.querySelectorAll(cardSelector).length;
          const timeoutCalls = globalThis.__courseAsyncProbe?.timeoutCalls ?? 0;
          document.querySelector(formSelector).requestSubmit();
          return {
            after: document.querySelectorAll(cardSelector).length,
            before,
            timeoutCalls,
          };
        },
        {
          cardSelector: application.cardSelector,
          formSelector: application.formSelector,
        },
      );
      assert.equal(immediate.before, initialCount, 'unexpected entity count before add');
      assert.equal(immediate.after, initialCount, 'add must update the UI asynchronously');

      await page.waitForFunction(
        ({ before, cardSelector, timeoutCalls }) =>
          document.querySelectorAll(cardSelector).length === before + 1 &&
          (globalThis.__courseAsyncProbe?.timeoutCalls ?? 0) > timeoutCalls,
        {
          before: initialCount,
          cardSelector: application.cardSelector,
          timeoutCalls: immediate.timeoutCalls,
        },
        { timeout: application.asyncTimeoutMs },
      );
      assert.equal(await addedCard(page, application, ui).count(), 1, 'new entity card text');
    },

    async checkPersistence() {
      await page.waitForFunction(
        (text) => Object.values(localStorage).some((value) => value.includes(text)),
        ui.uniqueText,
        { timeout: application.asyncTimeoutMs },
      );
      await page.reload({ waitUntil: 'networkidle' });
      await addedCard(page, application, ui).waitFor({
        state: 'visible',
        timeout: application.asyncTimeoutMs,
      });
    },

    async deleteEntity() {
      const card = addedCard(page, application, ui);
      const button = card.locator(application.deleteSelector);
      assert.equal(await button.count(), 1, 'new entity must have one delete control');
      const timeoutCalls = await page.evaluate(
        ({ cardSelector, deleteSelector, text }) => {
          const cardElement = [...document.querySelectorAll(cardSelector)].find((element) =>
            element.textContent.includes(text),
          );
          const before = globalThis.__courseAsyncProbe?.timeoutCalls ?? 0;
          cardElement.querySelector(deleteSelector).click();
          if (!cardElement?.isConnected) {
            throw new Error('delete must update the UI asynchronously');
          }
          return before;
        },
        {
          cardSelector: application.cardSelector,
          deleteSelector: application.deleteSelector,
          text: ui.uniqueText,
        },
      );

      await page.waitForFunction(
        ({ cardSelector, text, timeoutCalls }) =>
          ![...document.querySelectorAll(cardSelector)].some((element) =>
            element.textContent.includes(text),
          ) && (globalThis.__courseAsyncProbe?.timeoutCalls ?? 0) > timeoutCalls,
        {
          cardSelector: application.cardSelector,
          text: ui.uniqueText,
          timeoutCalls,
        },
        { timeout: application.asyncTimeoutMs },
      );
      await page.waitForFunction(
        (text) => !Object.values(localStorage).some((value) => value.includes(text)),
        ui.uniqueText,
        { timeout: application.asyncTimeoutMs },
      );
    },
  };
}

export const lab4Suite = {
  initScript: installAsyncProbe,
  createSteps({ contract, page, pageUrl }) {
    const scenario = createLab4Scenario(
      page,
      pageUrl,
      contract.common.application,
      contract.task.ui,
    );
    return [
      {
        name: 'Lab4 UI exposes the public test contract',
        operation: () => scenario.checkStructure(),
      },
      {
        name: 'Lab4 add operation is asynchronous and updates the UI',
        operation: () => scenario.addEntity(),
      },
      {
        name: 'Lab4 state is restored from localStorage',
        operation: () => scenario.checkPersistence(),
      },
      {
        name: 'Lab4 delete operation is asynchronous and persisted',
        operation: () => scenario.deleteEntity(),
      },
    ];
  },
};

function addedCard(page, application, ui) {
  return page.locator(application.cardSelector).filter({ hasText: ui.uniqueText });
}

async function fillControl(locator, value) {
  const tagName = await locator.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === 'select') {
    await locator.selectOption(String(value));
    return;
  }
  const type = await locator.getAttribute('type');
  if (type === 'checkbox' || type === 'radio') {
    if (value) {
      await locator.check();
    } else {
      await locator.uncheck();
    }
    return;
  }
  await locator.fill(String(value));
}
