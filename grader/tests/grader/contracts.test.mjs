import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  parsePrTitle,
  validateChangedPaths,
  validateReadme,
  validateRequiredFiles,
  validateTreeEntries,
  validateVariant,
} from '../../src/contracts.mjs';
import { runGate } from '../../src/pr-gate.mjs';

describe('PR contract', () => {
  test('parses an exact title', () => {
    expect(parsePrTitle('[TASK-3] variant_17 ivanov.ivan')).toEqual({
      lab: 3,
      slug: 'ivanov.ivan',
      variant: 17,
    });
    expect(parsePrTitle('[TASK-1] variant_40 van-der-meer.anna-maria')).toEqual({
      lab: 1,
      slug: 'van-der-meer.anna-maria',
      variant: 40,
    });
  });

  test.each([
    'TASK-3 variant_1 ivanov.ivan',
    '[TASK-0] variant_1 ivanov.ivan',
    '[TASK-2] variant_0 ivanov.ivan',
    '[TASK-2] variant_01 ivanov.ivan',
    '[TASK-2] variant_1 Ivanov.Ivan',
    '[TASK-2] variant_1 ivanov.ivan extra',
    '[TASK-2] variant_1 иванов.иван',
  ])('rejects invalid title %s', (title) => {
    expect(() => parsePrTitle(title)).toThrow();
  });

  test('allows exactly one lab path', () => {
    expect(
      validateChangedPaths(
        [{ filename: 'ivanov.ivan/lab2/solution.js' }, { filename: 'ivanov.ivan/lab2/README.md' }],
        'ivanov.ivan',
        2,
      ).prefix,
    ).toBe('ivanov.ivan/lab2/');
  });

  test('rejects another lab, student, or renamed source outside the directory', () => {
    expect(() =>
      validateChangedPaths([{ filename: 'ivanov.ivan/lab3/solution.js' }], 'ivanov.ivan', 2),
    ).toThrow(/outside/);
    expect(() =>
      validateChangedPaths(
        [
          {
            filename: 'ivanov.ivan/lab2/solution.js',
            previous_filename: 'petrov.petr/lab2/solution.js',
          },
        ],
        'ivanov.ivan',
        2,
      ),
    ).toThrow(/outside/);
  });

  test('validates the title variant against the task bank', () => {
    expect(validateVariant(40, 40)).toBe(40);
    expect(() => validateVariant(41, 40)).toThrow(/1 to 40/);
  });

  test('rejects unsafe git tree entries', () => {
    expect(() =>
      validateTreeEntries(
        [{ mode: '120000', size: 4, path: 'ivanov.ivan/lab2/link' }],
        'ivanov.ivan/lab2/',
      ),
    ).toThrow(/Symbolic/);
    expect(() =>
      validateTreeEntries(
        [{ mode: '100755', size: 4, path: 'ivanov.ivan/lab2/run.sh' }],
        'ivanov.ivan/lab2/',
      ),
    ).toThrow(/Executable/);
  });
});

describe('README contract', () => {
  const complete = `# Лабораторная работа 2

## Задание

Реализовать функцию.

## Реализация

Используется один проход.

## Запуск

npm run grade.
`;

  test('accepts filled sections', () => {
    expect(() => validateReadme(complete, 2)).not.toThrow();
  });

  test('rejects template comments as empty content', () => {
    expect(() =>
      validateReadme(complete.replace('Реализовать функцию.', '<!-- todo -->'), 2),
    ).toThrow(/must not be empty/);
  });
});

describe('required files', () => {
  test('requires a separate model entry for lab4', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'course-lab4-'));
    const readme =
      '# Лабораторная работа 4\n\n## Задание\n\nЗадача.\n\n## Реализация\n\nРешение.\n\n## Запуск\n\nЗапуск.\n';
    await Promise.all([
      writeFile(path.join(root, 'README.md'), readme),
      writeFile(path.join(root, 'index.html'), '<!doctype html><title>Lab 4</title>\n'),
      writeFile(path.join(root, 'styles.css'), 'body {}\n'),
      writeFile(path.join(root, 'main.js'), 'export {};\n'),
    ]);

    await expect(validateRequiredFiles(root, 4)).rejects.toThrow(/model\.js or model\.ts/);
    await writeFile(path.join(root, 'model.js'), 'export {};\n');
    await expect(validateRequiredFiles(root, 4)).resolves.toBeUndefined();
  });

  test('rejects the obsolete submission.json metadata file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'course-legacy-metadata-'));
    await writeFile(path.join(root, 'submission.json'), '{"variant":1}\n');
    await expect(validateRequiredFiles(root, 2)).rejects.toThrow(/no longer used/);
  });
});

describe('complete gate', () => {
  test('accepts a first lab and rejects mismatched established owner', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'course-gate-'));
    const directory = path.join(root, 'ivanov.ivan', 'lab2');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'solution.js'),
      'export function analyzieString() { return {}; }\n',
    );
    await writeFile(
      path.join(directory, 'README.md'),
      '# Лабораторная работа 2\n\n## Задание\n\nАнализ строки.\n\n## Реализация\n\nПосимвольный проход.\n\n## Запуск\n\nЗапустить grader.\n',
    );
    const event = {
      pull_request: {
        title: '[TASK-2] variant_1 ivanov.ivan',
        url: 'https://api.github.invalid/pulls/1',
        user: { login: 'student' },
        base: { repo: { full_name: 'course/repository' } },
      },
    };
    const files = ['README.md', 'solution.js'].map((name) => ({
      filename: `ivanov.ivan/lab2/${name}`,
    }));
    const treeEntries = files.map((file) => ({ mode: '100644', path: file.filename, size: 100 }));

    const accepted = await runGate({ binding: null, event, files, headRoot: root, treeEntries });
    expect(accepted.binding).toMatchObject({ firstSubmission: true, login: 'student', variant: 1 });

    await expect(
      runGate({
        binding: { login: 'another-student', variant: 1 },
        event,
        files,
        headRoot: root,
        treeEntries,
      }),
    ).rejects.toThrow(/belongs to/);

    await expect(
      runGate({
        binding: { login: 'student', variant: 2 },
        event,
        files,
        headRoot: root,
        treeEntries,
      }),
    ).rejects.toThrow(/variant_1/);
  });
});
