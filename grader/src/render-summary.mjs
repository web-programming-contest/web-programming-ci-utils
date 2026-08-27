#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from './args.mjs';
import { writeStepSummary } from './summary.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directory = path.resolve(args.results || 'grader-results');
  let result;
  try {
    result = JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8'));
  } catch {
    try {
      result = JSON.parse(await readFile(path.join(directory, 'failure.json'), 'utf8'));
    } catch {
      result = {
        checks: [],
        error: 'The grader stopped before producing a result.',
        passed: false,
      };
    }
  }

  const lines = [`## Trusted grader ${result.passed ? '✅' : '❌'}`, ''];
  if (result.task) {
    lines.push(`- Задача: ${result.task.title}`);
    lines.push(`- Вариант: ${result.variant}`);
    lines.push('');
  }
  if (result.checks?.length) {
    lines.push('| Проверка | Результат | Время |', '| --- | :---: | ---: |');
    for (const check of result.checks) {
      lines.push(`| ${check.name} | ${check.passed ? '✅' : '❌'} | ${check.durationMs} ms |`);
    }
  }
  if (result.error) {
    lines.push('', `**Ошибка:** ${result.error}`);
  }
  if (!result.passed) {
    lines.push('', 'Скриншоты, trace и HTML-отчёт доступны в artifact `grader-results`.');
  }
  await writeStepSummary(lines.join('\n'));
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
