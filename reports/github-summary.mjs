#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../shared/args.mjs';
import { writeStepSummary } from './output.mjs';

const reportOutputLimit = 12_000;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directory = path.resolve(args.results || 'grader-results');
  const result = await readResult(directory);
  const markdown = renderReport(result);

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'report.md'), `${markdown}\n`);
  await writeStepSummary(markdown);
  process.stdout.write(`${markdown}\n`);
}

export async function readResult(directory) {
  try {
    return JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8'));
  } catch {
    try {
      return JSON.parse(await readFile(path.join(directory, 'failure.json'), 'utf8'));
    } catch {
      return readInfrastructureFailure(directory);
    }
  }
}

async function readInfrastructureFailure(directory) {
  const logs = [
    ['docker-run.log', 'Запуск изолированного grader-контейнера'],
    ['docker-build.log', 'Сборка Docker-образа grader'],
  ];
  for (const [filename, name] of logs) {
    try {
      const output = await readFile(path.join(directory, filename), 'utf8');
      return {
        checks: [
          {
            durationMs: null,
            error: 'Инфраструктурный этап завершился до создания результата grader.',
            name,
            status: 'failed',
            stdout: output,
          },
        ],
        error: 'Grader остановился до создания summary.json.',
        passed: false,
      };
    } catch {
      // Try the preceding infrastructure stage.
    }
  }
  return {
    checks: [],
    error: 'Grader остановился до создания результата и диагностического лога.',
    passed: false,
  };
}

export function renderReport(result) {
  const checks = result.checks ?? [];
  const counts = countStatuses(checks);
  const lines = [`## Проверка лабораторной ${result.passed ? '✅' : '❌'}`, ''];

  if (result.task) {
    lines.push(`- Лабораторная: **lab${result.lab}**`);
    lines.push(`- Вариант: **${result.variant}**`);
    lines.push(`- Задача: **${escapeMarkdown(result.task.title)}**`);
    if (result.task.exportName) {
      lines.push(`- Ожидаемый экспорт: \`${escapeMarkdown(result.task.exportName)}\``);
    }
    lines.push(`- Общее время: **${formatDuration(result.durationMs)}**`, '');
  }

  lines.push(
    `**Итого:** ${counts.passed} успешно · ${counts.failed} с ошибкой · ${counts.skipped} пропущено`,
    '',
  );

  if (checks.length > 0) {
    lines.push(
      '| # | Этап | Статус | Время | Краткая информация |',
      '| -: | --- | :---: | ---: | --- |',
    );
    for (const [index, check] of checks.entries()) {
      lines.push(
        `| ${index + 1} | ${escapeTable(check.name)} | ${statusLabel(check.status)} | ${formatDuration(check.durationMs)} | ${escapeTable(checkSummary(check))} |`,
      );
    }
  }

  const failures = checks.filter((check) => check.status === 'failed');
  if (failures.length > 0) {
    lines.push('', '### Подробности ошибок');
    for (const check of failures) {
      lines.push('', renderFailure(check));
    }
  }

  if (result.error) {
    lines.push('', '### Ошибка grader', '', `<pre>${escapeHtml(result.error)}</pre>`);
    if (result.stack) {
      lines.push(
        '',
        '<details><summary>Технический stack trace</summary>',
        '',
        `<pre>${escapeHtml(limitOutput(result.stack))}</pre>`,
        '</details>',
      );
    }
  }

  if (!result.passed) {
    lines.push(
      '',
      '> Полный `summary.json`, этот `report.md`, а для браузерных проверок screenshot, trace и HTML-report находятся в artifact `grader-results-<PR number>`.',
    );
  }

  return lines.join('\n');
}

function renderFailure(check) {
  const lines = [
    `<details open><summary><strong>❌ ${escapeHtml(check.name)}</strong></summary>`,
    '',
  ];
  if (check.error) {
    lines.push(`<p><strong>Причина:</strong> ${escapeHtml(check.error)}</p>`);
  }
  if (check.exitCode !== null && check.exitCode !== undefined) {
    lines.push(`<p><strong>Exit code:</strong> ${escapeHtml(check.exitCode)}</p>`);
  }
  if (check.signal) {
    lines.push(`<p><strong>Signal:</strong> ${escapeHtml(check.signal)}</p>`);
  }
  if (check.command?.length) {
    lines.push(
      '<p><strong>Команда:</strong></p>',
      `<pre>${escapeHtml(formatCommand(check.command))}</pre>`,
    );
  }
  if (check.stdout) {
    lines.push(
      '<p><strong>stdout:</strong></p>',
      `<pre>${escapeHtml(limitOutput(check.stdout))}</pre>`,
    );
  }
  if (check.stderr) {
    lines.push(
      '<p><strong>stderr:</strong></p>',
      `<pre>${escapeHtml(limitOutput(check.stderr))}</pre>`,
    );
  }
  lines.push('', '</details>');
  return lines.join('\n');
}

function countStatuses(checks) {
  const result = { failed: 0, passed: 0, skipped: 0 };
  for (const check of checks) {
    const status = check.status ?? (check.passed ? 'passed' : 'failed');
    result[status] += 1;
  }
  return result;
}

function statusLabel(status) {
  return (
    {
      failed: '❌ Ошибка',
      passed: '✅ Пройдено',
      skipped: '⏭️ Пропущено',
    }[status] ?? '❔ Неизвестно'
  );
}

function checkSummary(check) {
  if (check.status === 'skipped') {
    return check.reason || 'Этап неприменим.';
  }
  if (check.status === 'passed') {
    return 'Проверка завершилась успешно.';
  }
  return check.error || `Exit code: ${check.exitCode ?? 'unknown'}`;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return '—';
  }
  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function formatCommand(command) {
  return command.map((part) => JSON.stringify(String(part))).join(' ');
}

function limitOutput(value) {
  const output = String(value);
  if (output.length <= reportOutputLimit) {
    return output;
  }
  return `[... пропущено ${output.length - reportOutputLimit} символов ...]\n${output.slice(-reportOutputLimit)}`;
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}[\]()#+.!|-]/g, '\\$&');
}

function escapeTable(value) {
  return escapeMarkdown(value).replace(/\r?\n/g, ' ');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
