#!/usr/bin/env node
import {
  loadBrowserContract,
  loadFunctionContract,
  loadModelContract,
} from '../docker-grader/contracts/store.mjs';
import { loadTaskBank, resolveTask } from '../docker-grader/tasks/store.mjs';

async function main() {
  const bank = await loadTaskBank();
  let validated = 0;

  for (let variant = 1; variant <= bank.variants.variantCount; variant += 1) {
    for (const lab of [1, 2, 3, 4, 5]) {
      const task = await resolveTask(lab, variant);
      if ([1, 4, 5].includes(lab)) {
        await loadBrowserContract(lab, variant);
      }
      if ([2, 3].includes(lab)) {
        await loadFunctionContract(lab, task.id);
      }
      if (lab === 4) {
        await loadModelContract(task.id);
      }
      validated += 1;
    }
  }

  console.log(
    `Validated ${validated} lab/variant mappings for ${bank.variants.variantCount} variants.`,
  );
}

main().catch((error) => {
  console.error(`Contract validation failed: ${error.message}`);
  process.exitCode = 1;
});
