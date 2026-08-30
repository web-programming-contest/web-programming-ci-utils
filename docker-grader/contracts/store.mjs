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
const lab5CommandTypes = new Set(['click', 'drag', 'fill', 'press', 'reload', 'select']);
const lab5ExpectationTypes = new Set([
  'changed',
  'increased',
  'matches',
  'storage-changed',
  'visible',
]);
const lab5StateTypes = new Set(['attribute', 'count', 'text', 'value', 'visual']);
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

export async function loadModelContract(taskId) {
  if (!/^[a-z0-9-]+$/.test(taskId)) {
    throw new Error(`Unsafe task id: ${taskId}`);
  }

  const [contracts, queries] = await Promise.all([
    readJson(path.join(contractsDirectory, 'lab4', 'models.json')),
    readJson(path.join(contractsDirectory, 'lab4', 'queries.json')),
  ]);
  const contract = contracts.find((candidate) => candidate.taskId === taskId);
  const queryContract = queries.find((candidate) => candidate.taskId === taskId);
  if (!contract) {
    throw new Error(`Model contract is missing for lab4 task ${taskId}.`);
  }
  if (
    typeof contract.classExport !== 'string' ||
    !Array.isArray(contract.constructorArgs) ||
    !Array.isArray(contract.expect) ||
    !Array.isArray(contract.actions)
  ) {
    throw new Error(`Model contract for ${taskId} is incomplete.`);
  }

  for (const action of contract.actions) {
    if (
      typeof action.method !== 'string' ||
      !Array.isArray(action.args) ||
      !Array.isArray(action.expect)
    ) {
      throw new Error(`Model action for ${taskId} is incomplete.`);
    }
  }
  if (!queryContract || !Array.isArray(queryContract.checks)) {
    throw new Error(`Query contract is missing for lab4 task ${taskId}.`);
  }
  for (const check of queryContract.checks) {
    if (
      typeof check.exportName !== 'string' ||
      !Array.isArray(check.args) ||
      (!Object.hasOwn(check, 'contains') && check.empty !== true)
    ) {
      throw new Error(`Query check for ${taskId} is incomplete.`);
    }
  }
  return { ...contract, functionChecks: queryContract.checks };
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
  if (lab === 4) {
    const application = common.application;
    if (
      !application ||
      typeof application.listSelector !== 'string' ||
      typeof application.formSelector !== 'string' ||
      typeof application.cardSelector !== 'string' ||
      typeof application.deleteSelector !== 'string' ||
      !Number.isFinite(application.asyncTimeoutMs)
    ) {
      throw new Error('Lab4 browser application contract is incomplete.');
    }
    if (!task.ui || typeof task.ui.uniqueText !== 'string' || !task.ui.fields) {
      throw new Error(`Lab4 UI data is missing for ${task.id}.`);
    }
  }
  if (lab === 5) {
    const application = common.application;
    if (
      !application ||
      typeof application.rootSelector !== 'string' ||
      !Number.isFinite(application.interactionTimeoutMs)
    ) {
      throw new Error('Lab5 browser application contract is incomplete.');
    }
  }

  if (lab === 5) {
    const scenarios = await readJson(path.join(labDirectory, 'scenarios.json'));
    variantData = scenarios.find((candidate) => candidate.taskId === task.id);
    validateLab5Contract(task.id, variantData);
  } else {
    try {
      const filename = lab === 1 ? `${task.id}.json` : `variant-${variant}.json`;
      variantData = await readJson(path.join(labDirectory, filename));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
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

  return { common, task, variant: variantData };
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

function validateUiEntry(taskId, kind, entry) {
  if (typeof entry.name !== 'string' || typeof entry.selector !== 'string') {
    throw new Error(`Browser ${kind} for ${taskId} must declare name and selector.`);
  }
}

function validateLab5Contract(taskId, contract) {
  if (!contract) {
    throw new Error(`Browser contract is missing for lab5 task ${taskId}.`);
  }
  if (!Array.isArray(contract.required) || !Array.isArray(contract.scenarios)) {
    throw new Error(`Lab5 contract for ${taskId} must declare required and scenarios arrays.`);
  }
  if (contract.scenarios.length === 0) {
    throw new Error(`Lab5 contract for ${taskId} must contain a scenario.`);
  }
  for (const requirement of contract.required) {
    if (
      typeof requirement.testId !== 'string' ||
      (requirement.minimum !== undefined &&
        (!Number.isInteger(requirement.minimum) || requirement.minimum < 1)) ||
      (requirement.visible !== undefined && typeof requirement.visible !== 'boolean')
    ) {
      throw new Error(`Lab5 required element for ${taskId} is invalid.`);
    }
  }
  for (const scenario of contract.scenarios) {
    if (
      typeof scenario.name !== 'string' ||
      !Array.isArray(scenario.actions) ||
      scenario.actions.length === 0 ||
      !Array.isArray(scenario.expect) ||
      scenario.expect.length === 0 ||
      (scenario.prepare !== undefined && !Array.isArray(scenario.prepare))
    ) {
      throw new Error(`Lab5 scenario for ${taskId} is incomplete.`);
    }
    for (const command of [...(scenario.prepare ?? []), ...scenario.actions]) {
      validateLab5Command(taskId, command);
    }
    for (const expectation of scenario.expect) {
      validateLab5Expectation(taskId, expectation);
    }
  }
}

function validateLab5Command(taskId, command) {
  if (!lab5CommandTypes.has(command.type)) {
    throw new Error(`Lab5 command for ${taskId} has unknown type ${command.type}.`);
  }
  if (command.type === 'press') {
    if (typeof command.key !== 'string') {
      throw new Error(`Lab5 press command for ${taskId} must declare key.`);
    }
    return;
  }
  if (command.type === 'reload') {
    return;
  }
  validateLab5Target(taskId, command);
  if (['fill', 'select'].includes(command.type) && command.value === undefined) {
    throw new Error(`Lab5 ${command.type} command for ${taskId} must declare value.`);
  }
  if (command.type === 'drag' && typeof command.targetTestId !== 'string') {
    throw new Error(`Lab5 drag command for ${taskId} must declare targetTestId.`);
  }
}

function validateLab5Expectation(taskId, expectation) {
  if (!lab5ExpectationTypes.has(expectation.type)) {
    throw new Error(`Lab5 expectation for ${taskId} has unknown type ${expectation.type}.`);
  }
  if (expectation.type !== 'storage-changed') {
    validateLab5Target(taskId, expectation);
  }
  if (expectation.state !== undefined && !lab5StateTypes.has(expectation.state)) {
    throw new Error(`Lab5 expectation for ${taskId} has unknown state ${expectation.state}.`);
  }
  if (expectation.state === 'attribute' && typeof expectation.attribute !== 'string') {
    throw new Error(`Lab5 attribute expectation for ${taskId} must declare attribute.`);
  }
  if (expectation.type === 'matches' && typeof expectation.pattern !== 'string') {
    throw new Error(`Lab5 matches expectation for ${taskId} must declare pattern.`);
  }
}

function validateLab5Target(taskId, descriptor) {
  if (typeof descriptor.testId !== 'string' && typeof descriptor.selector !== 'string') {
    throw new Error(`Lab5 descriptor for ${taskId} must declare testId or selector.`);
  }
  if (descriptor.index !== undefined && !Number.isInteger(descriptor.index)) {
    throw new Error(`Lab5 descriptor index for ${taskId} must be an integer.`);
  }
}
