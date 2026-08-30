import { checkElement, checkInteraction } from '../assertions.mjs';
import { checkRule } from '../rules/index.mjs';

export const lab1Suite = {
  createSteps({ contract, page }) {
    if (!contract.variant) {
      return [];
    }

    return [
      ...(contract.variant.elements ?? []).map((element) => ({
        name: element.name,
        operation: () => checkElement(page, element),
      })),
      ...(contract.variant.interactions ?? []).map((interaction) => ({
        name: interaction.name,
        operation: () => checkInteraction(page, interaction),
      })),
      ...(contract.variant.checks ?? []).map((rule) => ({
        name: rule.name,
        operation: () => checkRule(page, rule),
      })),
    ];
  },
};
