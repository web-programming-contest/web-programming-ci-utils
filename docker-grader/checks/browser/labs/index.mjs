import { lab1Suite } from './lab1.mjs';
import { lab4Suite } from './lab4.mjs';
import { lab5Suite } from './lab5.mjs';

const suites = new Map([
  [1, lab1Suite],
  [4, lab4Suite],
  [5, lab5Suite],
]);

export function getLabSuite(lab) {
  const suite = suites.get(lab);
  if (!suite) {
    throw new Error(`Browser checks are not supported for lab${lab}.`);
  }
  return suite;
}
