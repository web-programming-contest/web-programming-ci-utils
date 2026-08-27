import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export const SLUG_PATTERN = '[a-z]+(?:-[a-z]+)*\\.[a-z]+(?:-[a-z]+)*';
export const SLUG_REGEX = new RegExp(`^${SLUG_PATTERN}$`);
export const PR_TITLE_REGEX = new RegExp(
  `^\\[TASK-([1-5])\\] variant_([1-9][0-9]*) (${SLUG_PATTERN})$`,
);
export const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);
export const MAX_TEXT_FILE_BYTES = 1024 * 1024;
export const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;

const README_HEADINGS = [
  /^# Лабораторная работа [1-5]\s*$/m,
  /^## Задание\s*$/m,
  /^## Реализация\s*$/m,
  /^## Запуск\s*$/m,
];

export function parsePrTitle(title) {
  const match = PR_TITLE_REGEX.exec(title);
  if (!match) {
    throw new Error(
      'PR title must exactly match "[TASK-N] variant_K surname.name", where N is 1..5, K is a positive integer and the name is lowercase Latin.',
    );
  }

  return { lab: Number(match[1]), slug: match[3], variant: Number(match[2]) };
}

export function validateChangedPaths(files, slug, lab) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('The pull request does not contain changed files.');
  }

  const prefix = `${slug}/lab${lab}/`;
  const paths = [];

  for (const file of files) {
    const candidates = [file.filename, file.previous_filename].filter(Boolean);
    for (const filename of candidates) {
      validateRepositoryPath(filename);
      if (!filename.startsWith(prefix)) {
        throw new Error(`File outside the only allowed directory ${prefix}: ${filename}`);
      }
      paths.push(filename);
    }
  }

  return { prefix, paths };
}

export function validateRepositoryPath(filename) {
  const parts = filename.split('/');
  if (
    path.posix.isAbsolute(filename) ||
    filename.includes('\\') ||
    parts.some((part) => ['..', '.git', '.github', 'node_modules'].includes(part))
  ) {
    throw new Error(`Unsafe repository path: ${filename}`);
  }
  if (['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(parts.at(-1))) {
    throw new Error(`Student dependency manifests are not supported: ${filename}`);
  }
}

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

export function validateTreeEntries(entries, prefix) {
  let totalSize = 0;

  for (const entry of entries) {
    validateRepositoryPath(entry.path);
    if (!entry.path.startsWith(prefix)) {
      continue;
    }
    if (entry.mode === '120000') {
      throw new Error(`Symbolic links are forbidden: ${entry.path}`);
    }
    if (entry.mode === '160000') {
      throw new Error(`Git submodules are forbidden: ${entry.path}`);
    }
    if (entry.mode === '100755') {
      throw new Error(`Executable files are forbidden: ${entry.path}`);
    }

    const size = Number(entry.size ?? 0);
    const extension = path.extname(entry.path).toLowerCase();
    const relative = entry.path.slice(prefix.length);
    if (IMAGE_EXTENSIONS.has(extension)) {
      if (!relative.startsWith('assets/')) {
        throw new Error(`Binary images are only allowed under assets/: ${entry.path}`);
      }
      if (size > MAX_IMAGE_FILE_BYTES) {
        throw new Error(`Image exceeds 5 MiB: ${entry.path}`);
      }
    } else if (size > MAX_TEXT_FILE_BYTES) {
      throw new Error(`File exceeds 1 MiB: ${entry.path}`);
    }
    totalSize += size;
  }

  if (totalSize > MAX_SUBMISSION_BYTES) {
    throw new Error('Submission exceeds the total size limit of 20 MiB.');
  }
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
