import { describe, expect, test } from 'vitest';
import { loadTaskBank, resolveTask } from '../../src/task-bank.mjs';

describe('task bank', () => {
  test('contains a task for every lab2/lab3 variant', async () => {
    const bank = await loadTaskBank();
    expect(bank.variants.variantCount).toBe(40);
    for (const lab of [2, 3]) {
      for (let variant = 1; variant <= 40; variant += 1) {
        const task = await resolveTask(lab, variant);
        expect(task.id).toBeTruthy();
        expect(task.exportName).toBeTruthy();
      }
    }
  });

  test('reuses duplicate tasks instead of duplicating tests', async () => {
    expect((await resolveTask(2, 1)).id).toBe((await resolveTask(2, 26)).id);
    expect((await resolveTask(3, 1)).id).toBe((await resolveTask(3, 26)).id);
  });
});
