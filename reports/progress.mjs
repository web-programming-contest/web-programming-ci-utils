#!/usr/bin/env node
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRequiredFiles, validateVariant } from '../docker-grader/submission/contract.mjs';
import { loadTaskBank } from '../docker-grader/tasks/store.mjs';
import { git } from '../pr-gate/git.mjs';
import { findStudentBinding } from '../pr-gate/identity.mjs';
import { SLUG_REGEX } from '../pr-gate/title.mjs';
import { parseArgs } from '../shared/args.mjs';
import { attachCourseworks, findAcceptedCourseworks } from './coursework.mjs';

export async function buildProgressReport({
  root,
  repository,
  token,
  bindingLookup = findStudentBinding,
  courseworkLookup = findAcceptedCourseworks,
}) {
  const bank = await loadTaskBank();
  const entries = await readdir(root, { withFileTypes: true });
  const slugs = entries
    .filter((entry) => entry.isDirectory() && SLUG_REGEX.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

  const students = [];
  for (const slug of slugs) {
    const errors = [];
    const labs = {};
    for (let lab = 1; lab <= 5; lab += 1) {
      const directory = path.join(root, slug, `lab${lab}`);
      try {
        await validateRequiredFiles(directory, lab);
        labs[`lab${lab}`] = {
          accepted: true,
          acceptedAt: firstCommitDate(root, `${slug}/lab${lab}`),
          variant: null,
        };
      } catch (error) {
        if (error.code !== 'ENOENT' && !error.message.startsWith('Required file is missing')) {
          errors.push(`lab${lab}: ${error.message}`);
        }
        labs[`lab${lab}`] = { accepted: false, acceptedAt: null, variant: null };
      }
    }

    const acceptedCount = Object.values(labs).filter((lab) => lab.accepted).length;
    let binding = null;
    const hasLaboratory = (await readdir(path.join(root, slug))).some((name) =>
      /^lab[1-5]$/.test(name),
    );
    if (hasLaboratory) {
      try {
        binding = await bindingLookup({ baseRoot: root, repository, slug, token });
        if (binding) {
          validateVariant(binding.variant, bank.variants.variantCount);
          for (const lab of Object.values(labs).filter((value) => value.accepted)) {
            lab.variant = binding.variant;
          }
        }
      } catch (error) {
        errors.push(`binding: ${error.message}`);
      }
    }
    if (acceptedCount > 0 && !binding) {
      errors.push('cannot determine GitHub author and variant from a merged PR');
    }
    students.push({
      acceptedCount,
      errors,
      github: binding?.login ?? null,
      labs,
      slug,
      variant: binding?.variant ?? null,
    });
  }

  attachCourseworks(students, await courseworkLookup({ root, repository, token }));

  return {
    generatedAt: new Date().toISOString(),
    students,
    totals: {
      acceptedLabs: students.reduce((sum, student) => sum + student.acceptedCount, 0),
      acceptedCourseworks: students.filter((student) => student.coursework.accepted).length,
      acceptedWorks: students.reduce((sum, student) => sum + student.acceptedTotal, 0),
      students: students.length,
    },
  };
}

export function formatMarkdown(report) {
  const lines = [
    '# Прогресс сдачи лабораторных и курсовых',
    '',
    `Сформировано: ${report.generatedAt}`,
    '',
    '| Студент | GitHub | Вариант | Lab 1 | Lab 2 | Lab 3 | Lab 4 | Lab 5 | Курсовая | Итог |',
    '| --- | --- | ---: | :---: | :---: | :---: | :---: | :---: | :---: | ---: |',
  ];
  for (const student of report.students) {
    const labCells = [1, 2, 3, 4, 5].map((lab) => {
      const value = student.labs[`lab${lab}`];
      return value.accepted ? `✅ ${value.acceptedAt?.slice(0, 10) ?? ''}`.trim() : '—';
    });
    const coursework = student.coursework.accepted
      ? `✅ ${student.coursework.acceptedAt.slice(0, 10)} [#${student.coursework.pullNumber}](${student.coursework.url})`
      : '—';
    lines.push(
      `| ${escapeTableCell(student.slug ?? `@${student.github}`)} | ${escapeTableCell(student.github ?? '—')} | ${student.variant ?? '—'} | ${labCells.join(' | ')} | ${coursework} | ${student.acceptedTotal}/6 |`,
    );
    if (student.errors.length > 0) {
      lines.push(`| ⚠️ | ${student.errors.map(escapeTableCell).join('<br>')} | | | | | | | | |`);
    }
  }
  lines.push(
    '',
    `Всего: ${formatStudentCount(report.totals.students)}, ${formatAcceptedLabCount(report.totals.acceptedWorks)} (лабораторных: ${report.totals.acceptedLabs}, курсовых: ${report.totals.acceptedCourseworks}).`,
    '',
  );
  return lines.join('\n');
}

function formatStudentCount(count) {
  return `${count} ${selectRussianPlural(count, 'студент', 'студента', 'студентов')}`;
}

function formatAcceptedLabCount(count) {
  return `${count} ${selectRussianPlural(
    count,
    'принятая работа',
    'принятые работы',
    'принятых работ',
  )}`;
}

function selectRussianPlural(count, singular, paucal, plural) {
  const modulo100 = Math.abs(count) % 100;
  const modulo10 = modulo100 % 10;
  if (modulo100 >= 11 && modulo100 <= 14) {
    return plural;
  }
  if (modulo10 === 1) {
    return singular;
  }
  if (modulo10 >= 2 && modulo10 <= 4) {
    return paucal;
  }
  return plural;
}

export function formatCsv(report) {
  const rows = [
    [
      'slug',
      'github',
      'variant',
      'lab1',
      'lab2',
      'lab3',
      'lab4',
      'lab5',
      'accepted_count',
      'errors',
      'coursework_accepted',
      'coursework_accepted_at',
      'coursework_pr',
      'accepted_total',
    ],
  ];
  for (const student of report.students) {
    rows.push([
      student.slug ?? '',
      student.github ?? '',
      student.variant ?? '',
      ...[1, 2, 3, 4, 5].map((lab) => student.labs[`lab${lab}`].acceptedAt ?? ''),
      student.acceptedCount,
      student.errors.join('; '),
      student.coursework.accepted,
      student.coursework.acceptedAt ?? '',
      student.coursework.url ?? '',
      student.acceptedTotal,
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function firstCommitDate(root, submissionPath) {
  try {
    const commit = git(['log', '--reverse', '--format=%H', '--', submissionPath], root).split(
      '\n',
    )[0];
    return commit ? git(['show', '-s', '--format=%cI', commit], root) : null;
  } catch {
    return null;
  }
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeTableCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  let repository = args.repository || process.env.GITHUB_REPOSITORY;
  if (!repository) {
    try {
      const remote = git(['remote', 'get-url', 'origin'], root);
      repository = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(remote)?.[1];
    } catch {
      repository = 'local/course';
    }
  }

  const report = await buildProgressReport({ root, repository, token: process.env.GITHUB_TOKEN });
  if (args['output-dir']) {
    if (args.output || args.format) {
      throw new Error('--output-dir cannot be combined with --output or --format.');
    }
    const outputDirectory = path.resolve(args['output-dir']);
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDirectory, 'progress.md'), formatMarkdown(report)),
      writeFile(path.join(outputDirectory, 'progress.csv'), formatCsv(report)),
      writeFile(
        path.join(outputDirectory, 'progress.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      ),
    ]);
    return;
  }
  const format = args.format || 'markdown';
  if (!['csv', 'json', 'markdown'].includes(format)) {
    throw new Error('--format must be markdown, csv or json.');
  }
  const output =
    format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : format === 'csv'
        ? formatCsv(report)
        : formatMarkdown(report);
  if (args.output) {
    await writeFile(path.resolve(args.output), output);
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
