#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, requiredArg } from './args.mjs';
import { validateRequiredFiles, validateVariant } from './contracts.mjs';
import { prepareSite } from './prepare-site.mjs';
import { annotateError, writeJsonResult } from './summary.mjs';
import { loadTaskBank, resolveTask } from './task-bank.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function gradeSubmission({ submissionDirectory, lab, resultsDirectory, variant }) {
  const startedAt = new Date();
  const bank = await loadTaskBank();
  await validateRequiredFiles(submissionDirectory, lab);
  validateVariant(variant, bank.variants.variantCount);
  const task = await resolveTask(lab, variant);
  const files = await collectFiles(submissionDirectory);
  const checks = [];

  await mkdir(resultsDirectory, { recursive: true });

  runCheck(
    checks,
    'Prettier',
    binary('prettier'),
    ['--check', '--ignore-path', 'grader/config/submission-prettierignore', ...files],
    { cwd: root },
  );
  runCheck(
    checks,
    'Markdownlint',
    binary('markdownlint-cli2'),
    [
      '--no-globs',
      '--config',
      'grader/config/markdownlint-submission.jsonc',
      `:${path.join(submissionDirectory, 'README.md')}`,
    ],
    {
      cwd: root,
    },
  );

  const scriptFiles = files.filter((filename) => /\.(?:js|mjs|ts)$/.test(filename));
  if (scriptFiles.length > 0) {
    runCheck(
      checks,
      'ESLint',
      binary('eslint'),
      ['--no-ignore', '--max-warnings', '0', ...scriptFiles],
      { cwd: root },
    );
  }

  const cssFiles = files.filter((filename) => filename.endsWith('.css'));
  if (cssFiles.length > 0) {
    runCheck(checks, 'Stylelint', binary('stylelint'), cssFiles, { cwd: root });
  }

  const htmlFiles = files.filter((filename) => filename.endsWith('.html'));
  if (htmlFiles.length > 0) {
    runCheck(checks, 'HTML validation', binary('html-validate'), htmlFiles, { cwd: root });
  }

  const typescriptFiles = files.filter((filename) => filename.endsWith('.ts'));
  if (typescriptFiles.length > 0) {
    runCheck(
      checks,
      'TypeScript strict mode',
      binary('tsc'),
      [
        '--noEmit',
        '--strict',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--lib',
        'ES2022,DOM',
        '--skipLibCheck',
        ...typescriptFiles,
      ],
      { cwd: root },
    );
  }

  if (lab === 2 || lab === 3) {
    const solutionFile = (await exists(path.join(submissionDirectory, 'solution.ts')))
      ? 'solution.ts'
      : 'solution.js';
    runCheck(
      checks,
      'Functional tests',
      binary('vitest'),
      [
        'run',
        '--config',
        'grader/vitest.config.mjs',
        'grader/tests/submission-functions/functions.test.mjs',
      ],
      {
        cwd: root,
        env: {
          COURSE_LAB: String(lab),
          COURSE_SOLUTION_FILE: solutionFile,
          COURSE_SUBMISSION_DIR: submissionDirectory,
          COURSE_VARIANT: String(variant),
        },
      },
    );
  } else {
    const siteDirectory = await prepareSite(
      submissionDirectory,
      path.join(resultsDirectory, 'site'),
    );
    runCheck(
      checks,
      'Browser tests',
      binary('playwright'),
      ['test', '--config', 'grader/playwright.config.mjs'],
      {
        cwd: root,
        env: {
          COURSE_LAB: String(lab),
          COURSE_PLAYWRIGHT_REPORT: path.join(resultsDirectory, 'playwright-report'),
          COURSE_SITE_DIR: siteDirectory,
          COURSE_TEST_RESULTS: path.join(resultsDirectory, 'playwright'),
          COURSE_VARIANT: String(variant),
        },
      },
    );
  }

  const result = {
    checks,
    durationMs: Date.now() - startedAt.getTime(),
    lab,
    passed: checks.every((check) => check.passed),
    submission: submissionDirectory,
    task,
    variant,
  };
  await writeJsonResult(resultsDirectory, 'summary.json', result);
  return result;
}

function runCheck(checks, name, command, arguments_, options) {
  const startedAt = Date.now();
  console.log(`\n==> ${name}`);
  const result = spawnSync(process.execPath, [command, ...arguments_], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  const passed = result.status === 0 && !result.error;
  checks.push({
    durationMs: Date.now() - startedAt,
    exitCode: result.status,
    name,
    passed,
  });
  if (!passed) {
    const reason = result.error?.message || `exit code ${result.status}`;
    throw Object.assign(new Error(`${name} failed: ${reason}`), { checks });
  }
}

function binary(name) {
  return path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name,
  );
}

async function collectFiles(directory) {
  const result = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are forbidden: ${filename}`);
      }
      if (entry.isDirectory()) {
        await visit(filename);
      } else if (entry.isFile() && !isBinaryAsset(filename)) {
        result.push(filename);
      }
    }
  }
  await visit(directory);
  return result.sort();
}

function isBinaryAsset(filename) {
  return /\.(?:avif|gif|ico|jpe?g|png|webp)$/i.test(filename);
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
  console.log(
    `\nAll ${result.checks.length} checks passed for lab${lab}, variant ${result.variant}.`,
  );
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
      passed: false,
    });
    process.exitCode = 1;
  });
}
