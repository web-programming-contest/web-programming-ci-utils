import { getComponentValidator } from './components.mjs';
import { getLayoutValidator } from './layout.mjs';
import { getResponsiveValidator } from './responsive.mjs';
import { getVisualValidator } from './visual.mjs';

const resolverChain = [
  getComponentValidator,
  getLayoutValidator,
  getResponsiveValidator,
  getVisualValidator,
];

export async function checkRule(page, contract) {
  const validator = resolveValidator(contract.kind);
  if (!validator) {
    throw new Error(`Unknown browser rule: ${contract.kind}`);
  }
  await validator(page, contract);
}

function resolveValidator(kind) {
  return resolverChain.map((resolve) => resolve(kind)).find(Boolean);
}
