#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, requiredArg } from '../../../shared/args.mjs';
import { loadModelContract } from '../../contracts/store.mjs';
import { resolveTask } from '../../tasks/store.mjs';

export async function checkModel({ modelFile, variant }) {
  const task = await resolveTask(4, variant);
  const contract = await loadModelContract(task.id);
  const moduleUrl = `${pathToFileURL(modelFile).href}?grader=${Date.now()}`;
  const submissionModule = await import(moduleUrl);
  const Model = submissionModule[contract.classExport];

  assert.equal(typeof Model, 'function', `Expected named class export: ${contract.classExport}`);

  const instance = new Model(...structuredClone(contract.constructorArgs));
  await checkExpectations(instance, contract.expect, 'constructor');

  for (const action of contract.actions) {
    const operation = instance[action.method];
    assert.equal(typeof operation, 'function', `Expected method: ${action.method}`);
    await operation.apply(instance, structuredClone(action.args));
    await checkExpectations(instance, action.expect, action.method);
  }

  assert.deepStrictEqual(
    new Set(contract.functionChecks.map((check) => check.exportName)),
    new Set(task.functionExports),
    'model contract must cover every collection export',
  );
  const queryInstance = new Model(...structuredClone(contract.constructorArgs));
  for (const action of contract.actions.filter((item) => !item.method.startsWith('remove'))) {
    await queryInstance[action.method](...structuredClone(action.args));
  }
  for (const check of contract.functionChecks) {
    const operation = submissionModule[check.exportName];
    assert.equal(
      typeof operation,
      'function',
      `Expected named function export: ${check.exportName}`,
    );
    const collection = [queryInstance];
    const before = JSON.stringify(toSerializable(collection));
    const result = operation(collection, ...structuredClone(check.args));
    assert.ok(!(result instanceof Promise), `${check.exportName} must be synchronous`);
    assert.notEqual(
      result,
      undefined,
      `${check.exportName} must return a value for a non-empty collection`,
    );
    assert.equal(
      JSON.stringify(toSerializable(collection)),
      before,
      `${check.exportName} must not mutate its collection`,
    );
    if (check.empty) {
      assert.ok(isEmpty(result), `${check.exportName} must return an empty result`);
    } else {
      assert.ok(
        containsValue(result, check.contains),
        `${check.exportName} result must contain ${JSON.stringify(check.contains)}`,
      );
    }
  }

  console.log(
    `PASS ${contract.classExport}: constructor, ${contract.actions.length} actions and ${task.functionExports.length} collection exports.`,
  );
}

async function checkExpectations(instance, expectations, stage) {
  for (const expectation of expectations) {
    let actual = readMember(instance, expectation.path);
    if (expectation.call) {
      assert.equal(typeof actual, 'function', `${stage}: ${expectation.path} must be a method`);
      actual = await actual.call(instance);
    }
    assert.deepStrictEqual(actual, expectation.value, `${stage}: ${expectation.path}`);
  }
}

function readMember(instance, memberPath) {
  return memberPath.split('.').reduce((value, key) => value?.[key], instance);
}

function containsValue(value, expected, visited = new Set()) {
  if (Object.is(value, expected)) {
    return true;
  }
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return false;
  }
  visited.add(value);
  if (value instanceof Map) {
    return [...value].some(
      ([key, item]) =>
        containsValue(key, expected, visited) || containsValue(item, expected, visited),
    );
  }
  if (value instanceof Set) {
    return [...value].some((item) => containsValue(item, expected, visited));
  }
  return Object.values(value).some((item) => containsValue(item, expected, visited));
}

function isEmpty(value) {
  if (Array.isArray(value) || typeof value === 'string') {
    return value.length === 0;
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }
  return value && typeof value === 'object' && Object.keys(value).length === 0;
}

function toSerializable(value, visited = new Set()) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (visited.has(value)) {
    return '[circular]';
  }
  visited.add(value);
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Map) {
    return [...value].map(([key, item]) => [
      toSerializable(key, visited),
      toSerializable(item, visited),
    ]);
  }
  if (value instanceof Set) {
    return [...value].map((item) => toSerializable(item, visited));
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, visited));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toSerializable(item, visited)]),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const variant = Number(requiredArg(args, 'variant'));
  if (!Number.isInteger(variant) || variant < 1) {
    throw new Error('--variant must be a positive integer.');
  }
  await checkModel({
    modelFile: path.resolve(requiredArg(args, 'model')),
    variant,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(
      `\nModel check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
