#!/usr/bin/env node
import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { annotateError, writeJsonResult } from '../reports/output.mjs';
import { parseArgs, requiredArg } from '../shared/args.mjs';
import { runQualityChecks } from './checks/quality/index.mjs';
import { CheckSuite } from './runtime/check-suite.mjs';
import { prepareSite } from './runtime/prepare-site.mjs';
import { collectSourceFiles } from './runtime/submission-files.mjs';
import { validateRequiredFiles, validateVariant } from './submission/contract.mjs';
import { loadTaskBank, resolveTask } from './tasks/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function gradeSubmission({ submissionDirectory, lab, resultsDirectory, variant }) {
  const startedAt = new Date();
  const bank = await loadTaskBank();
  await validateRequiredFiles(submissionDirectory, lab);
  validateVariant(variant, bank.variants.variantCount);
  const task = await resolveTask(lab, variant);
  const files = await collectSourceFiles(submissionDirectory);
  const suite = new CheckSuite();

  await mkdir(resultsDirectory, { recursive: true });

  runQualityChecks({ files, root, suite });

  if (lab === 2 || lab === 3) {
    const solutionFile = (await exists(path.join(submissionDirectory, 'solution.ts')))
      ? 'solution.ts'
      : 'solution.js';
    suite.run(
      'Functional validation',
      path.join(root, 'docker-grader/checks/functions/run.mjs'),
      [
        '--lab',
        String(lab),
        '--variant',
        String(variant),
        '--solution',
        path.join(submissionDirectory, solutionFile),
      ],
      { cwd: root },
    );
  } else {
    suite.skip(
      'Functional validation',
      'Проверка функций solution применяется только к lab2/lab3.',
    );
  }

  if (lab === 4) {
    const modelFile = (await exists(path.join(submissionDirectory, 'model.ts')))
      ? 'model.ts'
      : 'model.js';
    suite.run(
      'Model validation',
      path.join(root, 'docker-grader/checks/model/run.mjs'),
      ['--variant', String(variant), '--model', path.join(submissionDirectory, modelFile)],
      { cwd: root },
    );
  } else {
    suite.skip('Model validation', 'Проверка модели применяется только к lab4.');
  }

  if ([1, 4, 5].includes(lab)) {
    try {
      const siteDirectory = await prepareSite(
        submissionDirectory,
        path.join(resultsDirectory, 'site'),
      );
      suite.run(
        'Browser validation',
        path.join(root, 'docker-grader/checks/browser/run.mjs'),
        [
          '--lab',
          String(lab),
          '--variant',
          String(variant),
          '--site',
          siteDirectory,
          '--results',
          path.join(resultsDirectory, 'browser'),
        ],
        {
          cwd: root,
        },
      );
    } catch (error) {
      suite.fail('Browser validation', error);
    }
  } else {
    suite.skip('Browser validation', 'Для lab2/lab3 используются функциональные проверки.');
  }

  const result = {
    checks: suite.checks,
    durationMs: Date.now() - startedAt.getTime(),
    lab,
    passed: suite.checks.every((check) => check.status !== 'failed'),
    submission: submissionDirectory,
    task,
    variant,
  };
  await writeJsonResult(resultsDirectory, 'summary.json', result);
  return result;
}

async function exists(filename) {
  try {
    return (await lstat(filename)).isFile();
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const submissionDirectory = path.resolve(requiredArg(args, 'submission'));
  const lab = Number(requiredArg(args, 'lab'));
  const variant = Number(requiredArg(args, 'variant'));
  if (!Number.isInteger(lab) || lab < 1 || lab > 5) {
    throw new Error('--lab must be an integer from 1 to 5.');
  }
  const resultsDirectory = path.resolve(args.results || 'grader-results');
  const result = await gradeSubmission({
    submissionDirectory,
    lab,
    resultsDirectory,
    variant,
  });
  if (result.passed) {
    console.log(
      `\nAll ${result.checks.length} checks passed or were skipped for lab${lab}, variant ${result.variant}.`,
    );
    return;
  }

  const failedChecks = result.checks.filter((check) => check.status === 'failed');
  annotateError(
    `${failedChecks.length} grader check(s) failed: ${failedChecks.map((check) => check.name).join(', ')}`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(async (error) => {
    annotateError(error.message);
    const args = parseArgs(process.argv.slice(2));
    const resultsDirectory = path.resolve(
      typeof args.results === 'string' ? args.results : 'grader-results',
    );
    await writeJsonResult(resultsDirectory, 'failure.json', {
      checks: error.checks ?? [],
      error: error.message,
      stack: error.stack,
      passed: false,
    });
    process.exitCode = 1;
  });
}
