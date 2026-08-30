import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const taskDirectory = path.dirname(fileURLToPath(import.meta.url));

let cache;

export async function loadTaskBank() {
  if (cache) {
    return cache;
  }

  const [variants, lab1, lab2, lab3, lab4, lab5] = await Promise.all([
    readJson(path.join(taskDirectory, 'variants.json')),
    readJson(path.join(taskDirectory, 'lab1.json')),
    readJson(path.join(taskDirectory, 'lab2.json')),
    readJson(path.join(taskDirectory, 'lab3.json')),
    readJson(path.join(taskDirectory, 'lab4.json')),
    readJson(path.join(taskDirectory, 'lab5.json')),
  ]);

  if (!Number.isInteger(variants.variantCount) || variants.variantCount < 1) {
    throw new Error('Task bank variantCount must be a positive integer.');
  }

  const taskLists = { 1: lab1, 2: lab2, 3: lab3, 4: lab4, 5: lab5 };
  const specs = {};

  for (const lab of [1, 2, 3, 4, 5]) {
    if (!Array.isArray(taskLists[lab]) || taskLists[lab].length === 0) {
      throw new Error(`Task list for lab${lab} must be a non-empty array.`);
    }
    const ids = new Set();
    for (const task of taskLists[lab]) {
      if (!task || !/^[a-z0-9-]+$/.test(task.id) || typeof task.title !== 'string') {
        throw new Error(`Task list for lab${lab} contains an invalid task.`);
      }
      if (ids.has(task.id)) {
        throw new Error(`Duplicate task id ${task.id} in lab${lab}.`);
      }
      ids.add(task.id);
    }
    specs[lab] = new Map(taskLists[lab].map((task) => [task.id, task]));
  }

  for (const lab of [1, 2, 3, 4, 5]) {
    const mapping = variants.labs[String(lab)];
    if (!Array.isArray(mapping) || mapping.length !== variants.variantCount) {
      throw new Error(`Task bank mapping for lab${lab} is incomplete.`);
    }
    for (const id of mapping) {
      if (!specs[lab].has(id)) {
        throw new Error(`Unknown task id ${id} in lab${lab} mapping.`);
      }
    }
  }

  cache = { variants, specs };
  return cache;
}

export async function resolveTask(lab, variant) {
  const bank = await loadTaskBank();
  if (!Number.isInteger(variant) || variant < 1 || variant > bank.variants.variantCount) {
    throw new Error(`Unknown variant: ${variant}`);
  }
  if (lab >= 1 && lab <= 5) {
    const id = bank.variants.labs[String(lab)][variant - 1];
    return bank.specs[lab].get(id);
  }
  throw new Error(`Unknown lab: ${lab}`);
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}
