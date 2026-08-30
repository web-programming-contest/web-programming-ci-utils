import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeBrowserReport(directory, result) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(path.join(directory, 'index.html'), renderHtml(result));
}

function renderHtml(result) {
  const rows = result.steps
    .map(
      (step) => `<tr class="${step.status}">
        <td>${step.status === 'passed' ? '✓' : '✗'}</td>
        <td>${escapeHtml(step.name)}</td>
        <td><pre>${escapeHtml(step.error ?? 'OK')}</pre></td>
      </tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Отчёт браузерной проверки</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 1100px; padding: 0 1rem; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d0d7de; padding: .6rem; text-align: left; vertical-align: top; }
      th { background: #f6f8fa; }
      .passed td:first-child { color: #1a7f37; }
      .failed td:first-child { color: #cf222e; }
      pre { margin: 0; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Браузерная проверка: ${result.passed ? 'пройдена' : 'не пройдена'}</h1>
    <p>Лабораторная работа: ${result.lab}. Вариант: ${result.variant}.</p>
    <table><thead><tr><th>Статус</th><th>Проверка</th><th>Подробности</th></tr></thead><tbody>${rows}</tbody></table>
  </body>
</html>\n`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
