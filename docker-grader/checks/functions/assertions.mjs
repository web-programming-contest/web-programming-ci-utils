import assert from 'node:assert/strict';

const assertionHandlers = new Map([
  ['equal', assertEqual],
  ['matches', assertMatches],
  ['pairs-unordered', assertPairsUnordered],
  ['parity-partition', assertParityPartition],
  ['permutation', assertPermutation],
  ['unordered', assertUnordered],
]);

export function assertCaseResult(contractCase, actual, arguments_) {
  const assertion = contractCase.assertion ?? 'equal';
  const handler = assertionHandlers.get(assertion);
  if (!handler) {
    throw new Error(`Unknown assertion type: ${assertion}`);
  }
  handler(contractCase, actual, arguments_);
}

function assertEqual(contractCase, actual) {
  assert.deepStrictEqual(actual, decodeContractValue(contractCase.expected));
}

function assertMatches(contractCase, actual) {
  assert.match(actual, new RegExp(contractCase.pattern, contractCase.flags));
}

function assertUnordered(contractCase, actual) {
  assert.deepStrictEqual(normalizeValues(actual), normalizeValues(contractCase.expected));
}

function assertPairsUnordered(contractCase, actual) {
  assert.deepStrictEqual(normalizePairs(actual), normalizePairs(contractCase.expected));
}

function assertPermutation(_contractCase, actual, arguments_) {
  assert.notStrictEqual(actual, arguments_[0], 'must return a new array');
  assert.deepStrictEqual(
    normalizeValues(actual),
    normalizeValues(arguments_[0]),
    'must preserve all input values',
  );
}

function assertParityPartition(_contractCase, actual, arguments_) {
  assert.ok(Array.isArray(actual), 'must return an array');
  assert.deepStrictEqual(
    normalizeValues(actual),
    normalizeValues(arguments_[0]),
    'must preserve all input values',
  );
  const firstOdd = actual.findIndex((value) => Math.abs(value % 2) === 1);
  assert.ok(
    firstOdd === -1 || actual.slice(firstOdd).every((value) => Math.abs(value % 2) === 1),
    'even values must precede odd values',
  );
}

export function decodeContractValue(value) {
  if (Array.isArray(value)) {
    return value.map(decodeContractValue);
  }
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$date === 'string') {
      return new Date(value.$date);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decodeContractValue(item)]),
    );
  }
  return value;
}

function normalizeValues(values) {
  assert.ok(Array.isArray(values), 'result must be an array');
  return values.map((value) => JSON.stringify(value)).sort();
}

function normalizePairs(pairs) {
  assert.ok(Array.isArray(pairs), 'result must be an array of pairs');
  return pairs
    .map((pair) => {
      assert.ok(Array.isArray(pair) && pair.length === 2, 'every result item must be a pair');
      return [...pair].sort((left, right) => left - right);
    })
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}
