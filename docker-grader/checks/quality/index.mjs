import { runEslint } from './eslint.mjs';
import { runHtmlValidate } from './html-validate.mjs';
import { runPrettier } from './prettier.mjs';
import { runStylelint } from './stylelint.mjs';
import { runTypescript } from './typescript.mjs';

export function runQualityChecks(context) {
  runPrettier(context);
  runEslint(context);
  runStylelint(context);
  runHtmlValidate(context);
  runTypescript(context);
}
