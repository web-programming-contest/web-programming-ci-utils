#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, requiredArg } from '../../../shared/args.mjs';
import { loadFunctionContract } from '../../contracts/store.mjs';
import { resolveTask } from '../../tasks/store.mjs';
import { assertCaseResult, decodeContractValue } from './assertions.mjs';
import { installFixedClock } from './clock.mjs';

export async function checkFunctions({ lab, solutionFile, variant }) {
  const task = await resolveTask(lab, variant);
  const contract = await loadFunctionContract(lab, task.id);
  const restoreClock = installFixedClock(contract.clock);

  try {
    const moduleUrl = `${pathToFileURL(solutionFile).href}?grader=${Date.now()}`;
    const submissionModule = await import(moduleUrl);
    const implementation = submissionModule[task.exportName];
    assert.equal(
      typeof implementation,
      'function',
      `Expected named ESM export "${task.exportName}". Export it from solution.js/solution.ts, for example: export function ${task.exportName}(...) { ... }`,
    );

    const failures = [];
    for (const contractCase of contract.cases) {
      try {
        runContractCase(contractCase, implementation);
        console.log(`PASS ${contractCase.name}`);
      } catch (error) {
        failures.push(formatFailure(contractCase.name, error));
        console.error(`FAIL ${contractCase.name}\n${formatError(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} of ${contract.cases.length} functional cases failed:\n\n${failures.join('\n\n')}`,
      );
    }
    console.log(`\n${contract.cases.length} functional cases passed for ${task.id}.`);
  } finally {
    restoreClock();
  }
}

function runContractCase(contractCase, implementation) {
  const repeat = contractCase.repeat ?? 1;
  for (let index = 0; index < repeat; index += 1) {
    const arguments_ = decodeContractValue(contractCase.args);
    const originalArguments = structuredClone(arguments_);
    const result = implementation(...arguments_);
    assert.ok(!(result instanceof Promise), 'async results are not supported by this contract');
    assertCaseResult(contractCase, result, originalArguments);
  }
}

function formatFailure(name, error) {
  return `${name}: ${formatError(error)}`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lab = Number(requiredArg(args, 'lab'));
  const variant = Number(requiredArg(args, 'variant'));
  if (![2, 3].includes(lab)) {
    throw new Error('--lab must be 2 or 3 for functional checks.');
  }
  if (!Number.isInteger(variant) || variant < 1) {
    throw new Error('--variant must be a positive integer.');
  }
  await checkFunctions({
    lab,
    solutionFile: path.resolve(requiredArg(args, 'solution')),
    variant,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`\nFunctional check failed: ${formatError(error)}`);
    process.exitCode = 1;
  });
}
