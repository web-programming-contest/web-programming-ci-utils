import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildProgressReport, formatCsv, formatMarkdown } from '../../src/progress-report.mjs';

describe('progress report', () => {
  test('discovers accepted labs without a roster file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'course-report-'));
    const directory = path.join(root, 'ivanov.ivan', 'lab2');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'solution.js'), 'export function value() {}\n');
    await writeFile(
      path.join(directory, 'README.md'),
      '# Лабораторная работа 2\n\n## Задание\n\nЗадача.\n\n## Реализация\n\nРешение.\n\n## Запуск\n\nЗапуск.\n',
    );

    const report = await buildProgressReport({
      bindingLookup: async () => ({ login: 'github-user', variant: 7 }),
      repository: 'course/repository',
      root,
    });

    expect(report.totals).toEqual({ acceptedLabs: 1, students: 1 });
    expect(report.students[0]).toMatchObject({
      acceptedCount: 1,
      github: 'github-user',
      slug: 'ivanov.ivan',
      variant: 7,
    });
    expect(report.students[0].labs.lab2.accepted).toBe(true);
    expect(formatMarkdown(report)).toContain('ivanov.ivan');
    expect(formatCsv(report)).toContain('ivanov.ivan,github-user,7');
  });
});
