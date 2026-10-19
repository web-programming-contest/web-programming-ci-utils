import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkModel, containsValue } from '../docker-grader/checks/model/run.mjs';

const traveler = { id: 15, travelerName: 'Sam', visitedCountries: ['Japan'] };

for (const [name, value, expected] of [
  ['numeric object grouping key', { 1: [traveler] }, 1],
  ['string object grouping key', { Japan: ['Sam'] }, 'Japan'],
  ['nested object grouping', { groups: { 1: [traveler] } }, 1],
  ['object without a prototype', Object.assign(Object.create(null), { 1: [traveler] }), 1],
  ['numeric Map grouping key', new Map([[1, [traveler]]]), 1],
  ['string Map grouping key', new Map([['Japan', ['Sam']]]), 'Japan'],
  ['Map value', new Map([['group', [traveler]]]), 'Sam'],
  ['Set value', new Set(['Japan']), 'Japan'],
  ['array value', [0, 1], 1],
  ['object value', { count: 1 }, 1],
]) {
  test(`model queries accept ${name}`, () => {
    assert.equal(containsValue(value, expected), true);
  });
}

for (const [name, value, expected] of [
  ['wrong numeric group', { 2: [traveler] }, 1],
  ['wrong country group', { France: ['Sam'] }, 'Japan'],
  ['array index', ['Sam', 'Alex'], 1],
  ['nested array index', { group: ['Sam', 'Alex'] }, 1],
  ['string value in place of a number', { count: '1' }, 1],
  ['string Map key in place of a number', new Map([['1', ['Sam']]]), 1],
  ['noncanonical numeric object key', { '01': ['Sam'] }, 1],
  ['inherited object key', Object.create({ Japan: ['Sam'] }), 'Japan'],
]) {
  test(`model queries reject ${name}`, () => {
    assert.equal(containsValue(value, expected), false);
  });
}

test('model query traversal handles cycles and shared references', () => {
  const groups = {};
  groups.self = groups;
  groups.travelers = [traveler, traveler];
  groups.byCountry = { Japan: ['Sam'] };

  assert.equal(containsValue(groups, 'Japan'), true);
  assert.equal(containsValue(groups, 'France'), false);
});

test('Travel model with object groupings passes all public model checks', async () => {
  await checkModel({
    modelFile: fileURLToPath(new URL('./fixtures/travel-model.mjs', import.meta.url)),
    variant: 15,
  });
});
