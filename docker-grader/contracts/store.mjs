import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTask } from '../tasks/store.mjs';

const contractsDirectory = path.dirname(fileURLToPath(import.meta.url));
const assertionTypes = new Set([
  'equal',
  'matches',
  'pairs-unordered',
  'parity-partition',
  'permutation',
  'unordered',
]);
export async function loadFunctionContract(lab, taskId) {
  if (![2, 3].includes(lab)) {
    throw new Error(`Functional contracts are not supported for lab${lab}.`);
  }
  if (!/^[a-z0-9-]+$/.test(taskId)) {
    throw new Error(`Unsafe task id: ${taskId}`);
  }

  const filename = path.join(contractsDirectory, `lab${lab}`, `${taskId}.json`);
  const data = JSON.parse(await readFile(filename, 'utf8'));

  if (data.taskId !== taskId) {
    throw new Error(`Contract ${filename} declares task ${data.taskId}, expected ${taskId}.`);
  }
  if (!Array.isArray(data.cases) || data.cases.length === 0) {
    throw new Error(`Contract for ${taskId} must contain a non-empty cases array.`);
  }
  if (data.clock && Number.isNaN(Date.parse(data.clock))) {
    throw new Error(`Contract for ${taskId} contains an invalid clock.`);
  }

  const names = new Set();
  for (const contractCase of data.cases) {
    if (typeof contractCase.name !== 'string' || contractCase.name.length === 0) {
      throw new Error(`Every case for ${taskId} must have a name.`);
    }
    if (names.has(contractCase.name)) {
      throw new Error(`Duplicate case name for ${taskId}: ${contractCase.name}`);
    }
    if (!Array.isArray(contractCase.args)) {
      throw new Error(`Case ${taskId}/${contractCase.name} must have an args array.`);
    }
    const assertion = contractCase.assertion ?? 'equal';
    if (!assertionTypes.has(assertion)) {
      throw new Error(`Case ${taskId}/${contractCase.name} has unknown assertion ${assertion}.`);
    }
    if (
      ['equal', 'pairs-unordered', 'unordered'].includes(assertion) &&
      !Object.hasOwn(contractCase, 'expected')
    ) {
      throw new Error(`Case ${taskId}/${contractCase.name} must declare expected.`);
    }
    if (assertion === 'matches' && typeof contractCase.pattern !== 'string') {
      throw new Error(`Case ${taskId}/${contractCase.name} must declare pattern.`);
    }
    if (
      contractCase.repeat !== undefined &&
      (!Number.isInteger(contractCase.repeat) || contractCase.repeat < 1)
    ) {
      throw new Error(`Case ${taskId}/${contractCase.name} has invalid repeat.`);
    }
    names.add(contractCase.name);
  }

  return data;
}

export async function loadBrowserContract(lab, variant) {
  if (![1, 4, 5].includes(lab)) {
    throw new Error(`Browser contracts are not supported for lab${lab}.`);
  }
  if (!Number.isInteger(variant) || variant < 1) {
    throw new Error(`Invalid browser contract variant: ${variant}`);
  }

  const labDirectory = path.join(contractsDirectory, `lab${lab}`);
  const common = await readJson(path.join(labDirectory, 'common.json'));
  let variantData = null;
  const task = await resolveTask(lab, variant);

  if (
    typeof common.page !== 'string' ||
    typeof common.titlePattern !== 'string' ||
    typeof common.meaningfulSelector !== 'string' ||
    !Number.isFinite(common.overflowTolerance)
  ) {
    throw new Error(`Common browser contract for lab${lab} is incomplete.`);
  }

  try {
    const filename = lab === 1 ? `${task.id}.json` : `variant-${variant}.json`;
    variantData = await readJson(path.join(labDirectory, filename));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (variantData && variantData.taskId !== task.id) {
    throw new Error(
      `Browser contract for lab${lab} variant ${variant} declares task ${variantData.taskId}, expected ${task.id}.`,
    );
  }

  if (variantData) {
    for (const collection of ['checks', 'elements', 'interactions']) {
      if (variantData[collection] !== undefined && !Array.isArray(variantData[collection])) {
        throw new Error(`Browser contract ${task.id}.${collection} must be an array.`);
      }
    }
    for (const element of variantData.elements ?? []) {
      validateUiEntry(task.id, 'element', element);
    }
    for (const interaction of variantData.interactions ?? []) {
      validateUiEntry(task.id, 'interaction', interaction);
      if (!['focus', 'hover'].includes(interaction.action)) {
        throw new Error(`Browser interaction ${task.id}/${interaction.name} has invalid action.`);
      }
    }
    for (const check of variantData.checks ?? []) {
      if (typeof check.name !== 'string' || typeof check.kind !== 'string') {
        throw new Error(`Browser rule for ${task.id} must declare name and kind.`);
      }
    }
  }

  return { common, variant: variantData };
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

function validateUiEntry(taskId, kind, entry) {
  if (typeof entry.name !== 'string' || typeof entry.selector !== 'string') {
    throw new Error(`Browser ${kind} for ${taskId} must declare name and selector.`);
  }
}
