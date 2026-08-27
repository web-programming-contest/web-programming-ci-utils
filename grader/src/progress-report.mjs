#!/usr/bin/env node
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './args.mjs';
import { SLUG_REGEX, validateRequiredFiles, validateVariant } from './contracts.mjs';
import { discoverBinding, git } from './git.mjs';
import { loadTaskBank } from './task-bank.mjs';

export async function buildProgressReport({
  root,
  repository,
  token,
  bindingLookup = discoverBinding,
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
    let binding = null;
    try {
      binding = await bindingLookup({ baseRoot: root, repository, slug, token });
      if (binding) {
        validateVariant(binding.variant, bank.variants.variantCount);
      }
    } catch (error) {
      errors.push(`binding: ${error.message}`);
    }

    const labs = {};
    for (let lab = 1; lab <= 5; lab += 1) {
      const directory = path.join(root, slug, `lab${lab}`);
      try {
        await validateRequiredFiles(directory, lab);
        labs[`lab${lab}`] = {
          accepted: true,
          acceptedAt: firstCommitDate(root, `${slug}/lab${lab}`),
          variant: binding?.variant ?? null,
        };
      } catch (error) {
        if (error.code !== 'ENOENT' && !error.message.startsWith('Required file is missing')) {
          errors.push(`lab${lab}: ${error.message}`);
        }
        labs[`lab${lab}`] = { accepted: false, acceptedAt: null, variant: null };
      }
    }

    const acceptedCount = Object.values(labs).filter((lab) => lab.accepted).length;
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

  return {
    generatedAt: new Date().toISOString(),
    students,
    totals: {
      acceptedLabs: students.reduce((sum, student) => sum + student.acceptedCount, 0),
      students: students.length,
    },
  };
}

export function formatMarkdown(report) {
  const lines = [
    '# Прогресс сдачи лабораторных',
    '',
    `Сформировано: ${report.generatedAt}`,
    '',
    '| Студент | GitHub | Вариант | Lab 1 | Lab 2 | Lab 3 | Lab 4 | Lab 5 | Итог |',
    '| --- | --- | ---: | :---: | :---: | :---: | :---: | :---: | ---: |',
  ];
  for (const student of report.students) {
    const labCells = [1, 2, 3, 4, 5].map((lab) => {
      const value = student.labs[`lab${lab}`];
      return value.accepted ? `✅ ${value.acceptedAt?.slice(0, 10) ?? ''}`.trim() : '—';
    });
    lines.push(
      `| ${student.slug} | ${student.github ?? '—'} | ${student.variant ?? '—'} | ${labCells.join(' | ')} | ${student.acceptedCount}/5 |`,
    );
    if (student.errors.length > 0) {
      lines.push(`| ⚠️ | ${student.errors.join('<br>')} | | | | | | | |`);
    }
  }
  lines.push(
    '',
    `Всего: ${report.totals.students} студентов, ${report.totals.acceptedLabs} принятых работ.`,
    '',
  );
  return lines.join('\n');
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
    ],
  ];
  for (const student of report.students) {
    rows.push([
      student.slug,
      student.github ?? '',
      student.variant ?? '',
      ...[1, 2, 3, 4, 5].map((lab) => student.labs[`lab${lab}`].acceptedAt ?? ''),
      student.acceptedCount,
      student.errors.join('; '),
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
  const format = args.format || 'markdown';
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
