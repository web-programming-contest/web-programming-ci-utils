import assert from 'node:assert/strict';

export async function evaluateRule(page, contract, evaluator) {
  const result = await page.evaluate(evaluator, contract);
  assert.ok(result.pass, `${contract.name}: ${result.details}`);
  return result;
}
