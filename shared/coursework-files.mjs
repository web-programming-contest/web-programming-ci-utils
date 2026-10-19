import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'target',
]);
const lockFiles = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]);
const webFilePattern = /\.(?:[cm]?js|jsx|[cm]?ts|tsx|css|scss|less|html|jsonc?|mdx?|ya?ml)$/i;

function validateRelativePath(filename) {
  if (
    typeof filename !== 'string' ||
    path.posix.isAbsolute(filename) ||
    /^[a-z]:/i.test(filename) ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    filename.split('/').some((part) => ['', '.', '..', '.git'].includes(part))
  ) {
    throw new Error(`Invalid coursework file path: ${filename}`);
  }
}

function isWebSource(filename) {
  const parts = filename.split('/');
  return (
    !parts.some((part) => ignoredDirectories.has(part)) &&
    !lockFiles.has(parts.at(-1)) &&
    webFilePattern.test(filename)
  );
}

export function courseworkChangedFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('The pull request does not contain changed files.');
  }
  const selected = [];
  for (const file of files) {
    validateRelativePath(file.filename);
    if (file.previous_filename) {
      validateRelativePath(file.previous_filename);
    }
    if (file.status !== 'removed' && isWebSource(file.filename)) {
      selected.push(file.filename);
    }
  }
  return [...new Set(selected)].sort();
}

export async function collectCourseworkFiles(directory, filenames) {
  const root = path.resolve(directory);
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error('Coursework root must be a regular directory.');
  }
  const result = [];

  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      const filename = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are forbidden: ${filename}`);
      }
      if (entry.isDirectory()) {
        await visit(filename);
      } else if (
        entry.isFile() &&
        isWebSource(path.relative(root, filename).split(path.sep).join('/'))
      ) {
        result.push(filename);
      }
    }
  }

  if (filenames === undefined) {
    await visit(root);
  } else {
    if (!Array.isArray(filenames)) {
      throw new Error('Coursework files must be a JSON array of relative paths.');
    }
    for (const filename of new Set(filenames)) {
      validateRelativePath(filename);
      if (!isWebSource(filename)) {
        continue;
      }
      let current = root;
      const parts = filename.split('/');
      for (const [index, part] of parts.entries()) {
        current = path.join(current, part);
        const stats = await lstat(current);
        if (
          stats.isSymbolicLink() ||
          (index < parts.length - 1 ? !stats.isDirectory() : !stats.isFile())
        ) {
          throw new Error(`Coursework source must be a regular file without symlinks: ${filename}`);
        }
      }
      result.push(current);
    }
  }
  return result.sort();
}
