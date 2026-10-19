import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import prettier from 'prettier';
import { gradeCoursework } from '../docker-grader/coursework.mjs';
import { runGate } from '../pr-gate/index.mjs';
import { parsePrTitle } from '../pr-gate/title.mjs';
import { renderReport } from '../reports/github-summary.mjs';
import { collectCourseworkFiles, courseworkChangedFiles } from '../shared/coursework-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const formatting = JSON.parse(
  await readFile(path.join(root, 'docker-grader/config/prettier.json'), 'utf8'),
);

async function fixture(t, sources, format = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'coursework-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const submission = path.join(directory, 'repository');
  await mkdir(submission);
  for (const [filename, source] of Object.entries(sources)) {
    const target = path.join(submission, filename);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
      target,
      format ? await prettier.format(source, { ...formatting, filepath: target }) : source,
    );
  }
  return { submissionDirectory: submission, resultsDirectory: path.join(directory, 'results') };
}

for (const prefix of ['COURSEWORK', 'COURSE_WORK']) {
  test(`accepts [${prefix}] with optional free-form description`, () => {
    for (const suffix of ['', ' variant_1 kolosov.ivan', ' Интернет-магазин']) {
      assert.deepEqual(parsePrTitle(`[${prefix}]${suffix}`), { kind: 'coursework' });
    }
  });

  test(`[${prefix}] gate accepts arbitrary layout without laboratory metadata`, async (t) => {
    const { submissionDirectory } = await fixture(t, {
      'web app/components/App.tsx': 'export const App = () => <main />;',
      'services/server.cjs': "module.exports = require('node:path');",
      'backend/pom.xml': '<project />',
    });
    const result = await runGate({
      event: { pull_request: { title: `[${prefix}] Свободное название` } },
      baseRoot: '/nonexistent-course-base',
      headRoot: submissionDirectory,
      files: [
        { filename: 'web app/components/App.tsx', status: 'added' },
        { filename: 'services/server.cjs', status: 'modified' },
        { filename: 'backend/pom.xml', status: 'added' },
        { filename: 'old.js', status: 'removed' },
      ],
    });
    assert.equal(result.kind, 'coursework');
    assert.equal(result.submissionRelative, '.');
    assert.equal(result.submissionDirectory, submissionDirectory);
    assert.deepEqual(result.files, ['services/server.cjs', 'web app/components/App.tsx']);
    assert.equal(result.lab, undefined);
    assert.equal(result.variant, undefined);
  });
}

test('laboratory title remains strict and unsupported coursework prefixes fail', () => {
  assert.deepEqual(parsePrTitle('[TASK-2] variant_7 ivanov.ivan'), {
    lab: 2,
    slug: 'ivanov.ivan',
    variant: 7,
  });
  for (const title of ['[TASK-2] free text', '[COURSE-WORK]', '[COURSEWORKX]', '[coursework]']) {
    assert.throws(() => parsePrTitle(title), /PR title must match/);
  }
});

test('selects changed web files, including renamed files, and ignores non-web/generated files', () => {
  const files = [
    'src/App.tsx',
    'api/index.js',
    'api/module.mts',
    'api/types.cts',
    'style.scss',
    'style.less',
    'index.html',
    'package.json',
    'config.yaml',
    'README.md',
    'backend/Main.java',
    'mvnw',
    'image.png',
    'package-lock.json',
    'pnpm-lock.yaml',
    'client/node_modules/library/index.js',
    'client/dist/index.js',
    'backend/target/index.html',
  ].map((filename) => ({ filename, status: 'added' }));
  files.push({ filename: 'src/new name.ts', previous_filename: 'old.ts', status: 'renamed' });
  files.push({ filename: 'deleted.js', status: 'removed' });
  assert.deepEqual(courseworkChangedFiles(files), [
    'README.md',
    'api/index.js',
    'api/module.mts',
    'api/types.cts',
    'config.yaml',
    'index.html',
    'package.json',
    'src/App.tsx',
    'src/new name.ts',
    'style.less',
    'style.scss',
  ]);
});

test('rejects paths escaping the checkout', async (t) => {
  const { submissionDirectory } = await fixture(t, {});
  for (const filename of [
    '../outside.js',
    '/tmp/outside.js',
    'C:/outside.js',
    'a/../x.js',
    '.git/config',
    'a\\b.js',
  ]) {
    assert.throws(() => courseworkChangedFiles([{ filename }]), /Invalid coursework file path/);
    await assert.rejects(
      collectCourseworkFiles(submissionDirectory, [filename]),
      /Invalid coursework file path/,
    );
  }
});

test('collects only manifest files; local mode scans recursively and skips dependencies', async (t) => {
  const { submissionDirectory } = await fixture(t, {
    'app/main.js': '',
    'other.student/lab2/solution.js': '',
    'node_modules/lib/index.js': '',
    'app/dist/bundle.js': '',
    'package-lock.json': '{}',
    'backend/Main.java': '',
  });
  const main = path.join(submissionDirectory, 'app/main.js');
  assert.deepEqual(
    await collectCourseworkFiles(submissionDirectory, ['app/main.js', 'app/main.js']),
    [main],
  );
  assert.deepEqual(await collectCourseworkFiles(submissionDirectory), [
    main,
    path.join(submissionDirectory, 'other.student/lab2/solution.js'),
  ]);
  await assert.rejects(collectCourseworkFiles(submissionDirectory, {}), /JSON array/);
});

test('rejects symlinked source files and parent directories', async (t) => {
  const { submissionDirectory } = await fixture(t, { 'real/main.js': '' });
  await symlink('real/main.js', path.join(submissionDirectory, 'link.js'));
  await symlink('real', path.join(submissionDirectory, 'linked-directory'));
  for (const filename of ['link.js', 'linked-directory/main.js']) {
    await assert.rejects(
      collectCourseworkFiles(submissionDirectory, [filename]),
      /without symlinks/,
    );
  }
});

test('grades web code without installing dependencies, executing code or requiring laboratory structure', async (t) => {
  const sources = {
    'frontend/components/App.tsx':
      "import {value} from 'not-installed-library'; export const App = () => <main>{value}</main>;",
    'backend/server.cjs':
      "const path = require('node:path'); module.exports = path.join(__dirname, 'data');",
    'backend/main.js':
      "const path = require('node:path'); module.exports = path.join(__dirname, 'data');",
    'frontend/types.mts': 'export const value: string = "test";',
    'frontend/styles/main.css': 'body { color: #333; }',
    'frontend/styles/nested.scss': '$color: #333; .card { color: $color; &:hover { color: red; } }',
    'frontend/public/index.html':
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coursework</title></head><body><main>Hello</main></body></html>',
    'package.json': '{"scripts":{"build":"exit 42","postinstall":"exit 42"}}',
    'eslint.config.mjs': "throw new Error('Student config must not execute');",
    'source.js': "throw new Error('Student code must not execute');",
  };
  const options = await fixture(t, sources, true);
  const result = await gradeCoursework({ ...options, filenames: Object.keys(sources) });
  assert.equal(result.passed, true, JSON.stringify(result.checks, null, 2));
  assert.deepEqual(
    result.checks.map(({ name, status }) => [name, status]),
    [
      ['Prettier', 'passed'],
      ['ESLint', 'passed'],
      ['Stylelint', 'passed'],
      ['HTML validation', 'passed'],
    ],
  );
  assert.equal(result.files.length, Object.keys(sources).length);
  const summary = JSON.parse(
    await readFile(path.join(options.resultsDirectory, 'summary.json'), 'utf8'),
  );
  assert.equal(summary.kind, 'coursework');
  assert.match(renderReport(summary), /Проверка курсовой работы/);
  assert.doesNotMatch(renderReport(summary), /Лабораторная:|Вариант:|labundefined/);
});

test('CLI checks only selected files and reports actual style/code violations', async (t) => {
  const options = await fixture(t, {
    'source.js': 'export const x=1;\n',
    'unrelated.js': 'invalid javascript ???',
  });
  const manifest = path.join(path.dirname(options.submissionDirectory), 'files.json');
  await writeFile(manifest, JSON.stringify(['source.js']));
  const args = [
    path.join(root, 'docker-grader/index.mjs'),
    '--kind',
    'coursework',
    '--submission',
    options.submissionDirectory,
    '--results',
    options.resultsDirectory,
    '--files',
    manifest,
  ];
  const failed = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  const failure = JSON.parse(
    await readFile(path.join(options.resultsDirectory, 'summary.json'), 'utf8'),
  );
  assert.equal(failure.checks.find(({ name }) => name === 'Prettier').status, 'failed');
  assert.equal(failure.checks.find(({ name }) => name === 'ESLint').status, 'passed');
  await writeFile(
    path.join(options.submissionDirectory, 'source.js'),
    'export const x = missingValue;\n',
  );
  const codeFailure = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(codeFailure.status, 1);
  const codeSummary = JSON.parse(
    await readFile(path.join(options.resultsDirectory, 'summary.json'), 'utf8'),
  );
  assert.equal(codeSummary.checks.find(({ name }) => name === 'ESLint').status, 'failed');
  await writeFile(path.join(options.submissionDirectory, 'source.js'), 'export const x = 1;\n');
  const passed = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
});

test('explicitly skips static checks when a PR changes only non-web files', async (t) => {
  const options = await fixture(t, { 'Main.java': 'invalid java is outside the web checks' });
  const filenames = courseworkChangedFiles([{ filename: 'Main.java', status: 'modified' }]);
  const result = await gradeCoursework({ ...options, filenames });
  assert.equal(result.passed, true);
  assert.equal(result.files.length, 0);
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every(({ status }) => status === 'skipped'));
});
