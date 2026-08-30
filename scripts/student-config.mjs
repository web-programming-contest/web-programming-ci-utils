import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const utilsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configRoot = path.join(utilsRoot, 'docker-grader', 'config');
const mappings = [
  ['editorconfig', '.editorconfig'],
  ['eslint.config.mjs', 'eslint.config.mjs'],
  ['gitignore', '.gitignore'],
  ['htmlvalidate.json', '.htmlvalidate.json'],
  ['node-version', '.nvmrc'],
  ['prettier.json', '.prettierrc.json'],
  ['prettierignore', '.prettierignore'],
  ['student-package.json', 'package.json'],
  ['stylelint.json', '.stylelintrc.json'],
];

export async function syncStudentConfig(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const updates = await findConfigUpdates(root);

  await mkdir(root, { recursive: true });
  for (const update of updates) {
    await writeFile(update.target, update.contents, 'utf8');
  }

  return {
    repositoryRoot: root,
    updatedFiles: updates.map(({ target }) => target),
  };
}

export async function assertStudentConfig(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const updates = await findConfigUpdates(root);
  if (updates.length > 0) {
    const filenames = updates.map(({ target }) => path.relative(root, target)).join(', ');
    throw new Error(
      `Course tooling is not synchronized with the pinned grader: ${filenames}. ` +
        'A maintainer must run the ci-utils course update script.',
    );
  }
}

export function studentConfigTargets() {
  return mappings.map(([, target]) => target);
}

async function findConfigUpdates(root) {
  const updates = [];
  for (const [sourceName, targetName] of mappings) {
    const source = path.join(configRoot, sourceName);
    const target = path.join(root, targetName);
    const expected = await readFile(source, 'utf8');
    const current = await readFile(target, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    if (current !== expected) {
      updates.push({ contents: expected, target });
    }
  }
  return updates;
}
