import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { listMergedPullRequests } from '../pr-gate/github.mjs';
import { findAcceptedCourseworks } from '../reports/coursework.mjs';
import { buildProgressReport, formatCsv, formatMarkdown } from '../reports/progress.mjs';

const repository = 'example/course';
const readme =
  '# Лабораторная работа 2\n\n## Задание\nЗадача\n\n## Реализация\nКод\n\n## Запуск\nNode.js\n';

async function checkout(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'progress-coursework-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [filename, contents] of Object.entries(files)) {
    const target = path.join(root, filename);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-b', 'main');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-m',
    'Accepted submissions',
  );
  return { root, sha: git('rev-parse', 'HEAD') };
}

function coursework(sha, overrides = {}) {
  return {
    number: 50,
    title: '[COURSEWORK] Свободное название проекта',
    user: { login: 'Student' },
    merged_at: '2026-10-15T12:00:00Z',
    merge_commit_sha: sha,
    ...overrides,
  };
}

function courseworkLookup(pulls) {
  return (options) => findAcceptedCourseworks({ ...options, pullLookup: async () => pulls });
}

for (const prefix of ['COURSEWORK', 'COURSE_WORK']) {
  test(`progress accepts merged [${prefix}] independently of repository layout`, async (t) => {
    const { root, sha } = await checkout(t, { 'apps/store/ui/main.tsx': 'application' });
    const report = await buildProgressReport({
      root,
      repository,
      bindingLookup: async () => {
        assert.fail('A coursework-only author needs no laboratory binding');
      },
      courseworkLookup: courseworkLookup([coursework(sha, { title: `[${prefix}] Магазин` })]),
    });
    assert.equal(report.students.length, 1);
    const student = report.students[0];
    assert.equal(student.github, 'Student');
    assert.equal(student.slug, null);
    assert.equal(student.variant, null);
    assert.equal(student.acceptedCount, 0);
    assert.equal(student.acceptedTotal, 1);
    assert.equal(student.coursework.accepted, true);
    assert.equal(student.coursework.acceptedAt, '2026-10-15T12:00:00Z');
    assert.equal(student.coursework.url, 'https://github.com/example/course/pull/50');
    assert.deepEqual(student.errors, []);
    assert.deepEqual(report.totals, {
      acceptedLabs: 0,
      acceptedCourseworks: 1,
      acceptedWorks: 1,
      students: 1,
    });
  });
}

test('open, rejected, invalidly titled and merged elsewhere PRs do not count as coursework', async (t) => {
  const { root, sha } = await checkout(t);
  const result = await findAcceptedCourseworks({
    root,
    repository,
    pullLookup: async () => [
      coursework(sha, { number: 1, merged_at: null, state: 'open' }),
      coursework(sha, { number: 2, merged_at: null, state: 'closed' }),
      coursework('f'.repeat(40), { number: 3 }),
      coursework(sha, { number: 4, title: '[TASK-2] variant_1 student.name' }),
      coursework(sha, { number: 5, title: '[COURSEWORKX] project' }),
    ],
  });
  assert.deepEqual(result, []);
});

test('counts one coursework per GitHub author and uses the first merge date', async (t) => {
  const { root, sha } = await checkout(t);
  const result = await findAcceptedCourseworks({
    root,
    repository,
    pullLookup: async () => [
      coursework(sha),
      coursework(sha, {
        number: 35,
        user: { login: 'STUDENT' },
        title: '[COURSE_WORK] variant_1 student.name',
        merged_at: '2026-10-01T12:00:00Z',
      }),
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].pullNumber, 35);
  assert.equal(result[0].acceptedAt, '2026-10-01T12:00:00Z');
  assert.equal(result[0].slug, 'student.name');
});

test('joins coursework to the laboratory author and preserves laboratory totals and variant', async (t) => {
  const { root, sha } = await checkout(t, {
    'student.name/lab2/README.md': readme,
    'student.name/lab2/solution.js': 'export const value = 1;',
    'other.name/lab2/README.md': readme,
    'other.name/lab2/solution.js': 'export const value = 2;',
  });
  const report = await buildProgressReport({
    root,
    repository,
    bindingLookup: async ({ slug }) => ({
      login: slug === 'student.name' ? 'Student' : 'Other',
      variant: 7,
    }),
    courseworkLookup: courseworkLookup([
      coursework(sha, { title: '[COURSEWORK] variant_39 other.name', user: { login: 'student' } }),
    ]),
  });
  const student = report.students.find(({ slug }) => slug === 'student.name');
  const other = report.students.find(({ slug }) => slug === 'other.name');
  assert.equal(student.coursework.accepted, true);
  assert.equal(
    other.coursework.accepted,
    false,
    'A name in the title cannot override the PR author',
  );
  assert.equal(student.acceptedCount, 1);
  assert.equal(student.acceptedTotal, 2);
  assert.equal(student.variant, 7);
  assert.equal(student.labs.lab2.variant, 7);
  assert.equal(student.labs.lab2.accepted, true);
  assert.equal(student.labs.lab1.accepted, false);
  assert.deepEqual(student.errors, []);
  assert.deepEqual(report.totals, {
    acceptedLabs: 2,
    acceptedCourseworks: 1,
    acceptedWorks: 3,
    students: 2,
  });

  const markdown = formatMarkdown(report);
  assert.match(markdown, /\| Курсовая \| Итог \|/);
  assert.match(markdown, /2026-10-15 \[#50\]\(https:\/\/github.com\/example\/course\/pull\/50\)/);
  assert.match(markdown, /\| 2\/6 \|/);
  assert.match(markdown, /лабораторных: 2, курсовых: 1/);
  const [header, ...rows] = formatCsv(report)
    .trim()
    .split('\n')
    .map((row) => row.split(','));
  const csvStudent = rows.find((row) => row[0] === 'student.name');
  assert.equal(csvStudent[header.indexOf('accepted_count')], '1');
  assert.equal(csvStudent[header.indexOf('accepted_total')], '2');
  assert.equal(csvStudent[header.indexOf('coursework_accepted')], 'true');
  assert.equal(csvStudent[header.indexOf('coursework_accepted_at')], '2026-10-15T12:00:00Z');
  assert.equal(
    csvStudent[header.indexOf('coursework_pr')],
    'https://github.com/example/course/pull/50',
  );
  assert.equal(
    JSON.parse(JSON.stringify(report)).students.find(({ slug }) => slug === 'student.name')
      .coursework.pullNumber,
    50,
  );
});

test('coursework-only directory with a matching name is shown once without requiring a lab binding', async (t) => {
  const { root, sha } = await checkout(t, { 'student.name/free-layout/main.js': 'code' });
  const report = await buildProgressReport({
    root,
    repository,
    bindingLookup: async () => {
      assert.fail('No laboratory has been accepted');
    },
    courseworkLookup: courseworkLookup([
      coursework(sha, { title: '[COURSEWORK] variant_1 student.name' }),
    ]),
  });
  assert.equal(report.students.length, 1);
  assert.equal(report.students[0].slug, 'student.name');
  assert.equal(report.students[0].github, 'Student');
  assert.equal(report.students[0].variant, null);
  assert.deepEqual(report.students[0].errors, []);
});

test('a directory called coursework alone does not imply acceptance', async (t) => {
  const { root } = await checkout(t, { 'student.name/coursework/main.js': 'unaccepted code' });
  const report = await buildProgressReport({ root, repository, courseworkLookup: async () => [] });
  assert.equal(report.students[0].coursework.accepted, false);
  assert.equal(report.totals.acceptedCourseworks, 0);
  assert.match(formatMarkdown(report), /\| 0\/6 \|/);
});

test('laboratory structure errors do not lose the author binding or duplicate coursework', async (t) => {
  const { root, sha } = await checkout(t, { 'student.name/lab2/README.md': 'Invalid lab' });
  const report = await buildProgressReport({
    root,
    repository,
    bindingLookup: async () => ({ login: 'Student', variant: 7 }),
    courseworkLookup: courseworkLookup([coursework(sha)]),
  });
  assert.equal(report.students.length, 1);
  assert.equal(report.students[0].github, 'Student');
  assert.equal(report.students[0].variant, 7);
  assert.equal(report.students[0].acceptedCount, 0);
  assert.equal(report.students[0].acceptedTotal, 1);
  assert.equal(report.students[0].coursework.accepted, true);
  assert.ok(report.students[0].errors.some((error) => error.startsWith('lab2:')));
});

test('an author with multiple laboratory directories gets only one coursework credit', async (t) => {
  const { root, sha } = await checkout(t, {
    'first.name/lab2/README.md': readme,
    'first.name/lab2/solution.js': '',
    'second.name/lab2/README.md': readme,
    'second.name/lab2/solution.js': '',
  });
  const report = await buildProgressReport({
    root,
    repository,
    bindingLookup: async () => ({ login: 'Student', variant: 1 }),
    courseworkLookup: courseworkLookup([coursework(sha)]),
  });
  assert.equal(report.totals.acceptedCourseworks, 1);
  const accepted = report.students.filter((student) => student.coursework.accepted);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].slug, null);
  assert.match(accepted[0].errors[0], /multiple student directories/);
});

test('GitHub failure does not silently turn accepted coursework into missing work', async (t) => {
  const { root } = await checkout(t);
  await assert.rejects(
    buildProgressReport({
      root,
      repository,
      courseworkLookup: async () => {
        throw new Error('GitHub API rate limit is exhausted');
      },
    }),
    /GitHub API rate limit/,
  );
});

test('missing author of a merged coursework produces a diagnostic', async (t) => {
  const { root, sha } = await checkout(t);
  await assert.rejects(
    findAcceptedCourseworks({
      root,
      repository,
      pullLookup: async () => [coursework(sha, { user: null })],
    }),
    /Cannot determine the author.*#50/,
  );
});

test('loads all closed PR pages and keeps only merged PRs', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    const page = new URL(url).searchParams.get('page');
    const batch =
      page === '1'
        ? Array.from({ length: 100 }, (_, index) => ({ number: index + 1, merged_at: null }))
        : [{ number: 101, merged_at: '2026-10-15T12:00:00Z' }];
    return { ok: true, json: async () => batch };
  });
  const pulls = await listMergedPullRequests(repository, 'test-token');
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => new URL(url).searchParams.get('state') === 'closed'));
  assert.deepEqual(
    pulls.map(({ number }) => number),
    [101],
  );
});
