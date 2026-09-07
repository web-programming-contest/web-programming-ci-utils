import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import stylelint from 'stylelint';

const configFile = fileURLToPath(
  new URL('../docker-grader/config/stylelint.json', import.meta.url),
);

for (const family of ['Arial', 'arial', 'ARIAL', 'Arial, Helvetica, sans-serif']) {
  test(`course Stylelint accepts ${family}`, async () => {
    const result = await stylelint.lint({ code: `.card { font-family: ${family}; }`, configFile });
    assert.equal(result.errored, false, JSON.stringify(result.results[0].warnings));
  });
}

test('course Stylelint still requires fallbacks for other named fonts', async () => {
  const result = await stylelint.lint({ code: '.card { font-family: Helvetica; }', configFile });
  assert.equal(result.errored, true);
  assert.ok(
    result.results[0].warnings.some(
      ({ rule }) => rule === 'font-family-no-missing-generic-family-keyword',
    ),
  );
});
