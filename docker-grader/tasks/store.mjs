import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const taskDirectory = path.dirname(fileURLToPath(import.meta.url));

let cache;

export async function loadTaskBank() {
  if (cache) {
    return cache;
  }

  const [variants, lab1, lab2, lab3] = await Promise.all([
    readJson(path.join(taskDirectory, 'variants.json')),
    readJson(path.join(taskDirectory, 'lab1.json')),
    readJson(path.join(taskDirectory, 'lab2.json')),
    readJson(path.join(taskDirectory, 'lab3.json')),
  ]);

  const specs = {
    1: new Map(lab1.map((task) => [task.id, task])),
    2: new Map(lab2.map((task) => [task.id, task])),
    3: new Map(lab3.map((task) => [task.id, task])),
  };

  for (const lab of [1, 2, 3]) {
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
  if (lab >= 1 && lab <= 3) {
    const id = bank.variants.labs[String(lab)][variant - 1];
    return bank.specs[lab].get(id);
  }
  return { id: `variant-${variant}`, title: `Лабораторная ${lab}, вариант ${variant}` };
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}
