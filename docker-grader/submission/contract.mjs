import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

const README_HEADINGS = [
  /^# Лабораторная работа [1-5]\s*$/m,
  /^## Задание\s*$/m,
  /^## Реализация\s*$/m,
  /^## Запуск\s*$/m,
];

export function validateVariant(variant, variantCount) {
  if (!Number.isInteger(variant) || variant < 1 || variant > variantCount) {
    throw new Error(`PR title variant must be an integer from 1 to ${variantCount}.`);
  }

  return variant;
}

export function validateReadme(contents, lab) {
  const expectedTitle = new RegExp(`^# Лабораторная работа ${lab}\\s*$`, 'm');
  if (!expectedTitle.test(contents)) {
    throw new Error(`README.md must start with "# Лабораторная работа ${lab}".`);
  }

  for (const heading of README_HEADINGS.slice(1)) {
    if (!heading.test(contents)) {
      throw new Error(`README.md is missing a required heading matching ${heading}.`);
    }
  }

  const sections = ['Задание', 'Реализация', 'Запуск'];
  for (const section of sections) {
    const marker = `## ${section}`;
    const start = contents.indexOf(marker) + marker.length;
    const remaining = contents.slice(start);
    const nextHeading = remaining.search(/\n## /);
    const sectionBody = nextHeading === -1 ? remaining : remaining.slice(0, nextHeading);
    const body = sectionBody
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/```[a-z]*\s*/gi, '')
      .replace(/```/g, '')
      .trim();
    if (!body) {
      throw new Error(`README.md section "${section}" must not be empty.`);
    }
  }
}

export async function validateRequiredFiles(submissionDirectory, lab) {
  const required = ['README.md'];
  if (await pathExists(path.join(submissionDirectory, 'submission.json'))) {
    throw new Error(
      'submission.json is no longer used; put the variant in the PR title as variant_K.',
    );
  }
  if (lab === 1) {
    required.push('index.html', 'styles.css');
  } else if (lab === 2 || lab === 3) {
    const entries = await existingFiles(submissionDirectory, ['solution.js', 'solution.ts']);
    if (entries.length !== 1) {
      throw new Error(`lab${lab} must contain exactly one of solution.js or solution.ts.`);
    }
  } else {
    required.push('index.html', 'styles.css');
    const entries = await existingFiles(submissionDirectory, ['main.js', 'main.ts']);
    if (entries.length !== 1) {
      throw new Error(`lab${lab} must contain exactly one of main.js or main.ts.`);
    }
    if (lab === 4) {
      const modelEntries = await existingFiles(submissionDirectory, ['model.js', 'model.ts']);
      if (modelEntries.length !== 1) {
        throw new Error('lab4 must contain exactly one of model.js or model.ts.');
      }
    }
  }

  for (const filename of required) {
    const filePath = path.join(submissionDirectory, filename);
    let stats;
    try {
      stats = await lstat(filePath);
    } catch {
      throw new Error(`Required file is missing: ${filename}`);
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Required path must be a regular file: ${filename}`);
    }
  }

  const readme = await readFile(path.join(submissionDirectory, 'README.md'), 'utf8');
  validateReadme(readme, lab);
}

async function existingFiles(root, filenames) {
  const result = [];
  for (const filename of filenames) {
    try {
      const stats = await lstat(path.join(root, filename));
      if (stats.isFile() && !stats.isSymbolicLink()) {
        result.push(filename);
      }
    } catch {
      // Missing alternatives are expected.
    }
  }
  return result;
}

async function pathExists(filename) {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
