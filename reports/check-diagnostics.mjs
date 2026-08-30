import { sanitizeTerminalOutput } from '../shared/terminal.mjs';

const maxSummaryDiagnostics = 3;

export function extractCheckDiagnostics(check) {
  if (check.name === 'Prettier') {
    return extractPrettierDiagnostics(check);
  }
  if (check.name === 'ESLint') {
    return extractEslintDiagnostics(check);
  }
  return [];
}

export function summarizeCheckDiagnostics(check) {
  const diagnostics = extractCheckDiagnostics(check);
  if (diagnostics.length === 0) {
    return null;
  }

  const visible = diagnostics.slice(0, maxSummaryDiagnostics).map(formatDiagnostic);
  const remaining = diagnostics.length - visible.length;
  if (remaining > 0) {
    visible.push(`ещё ${remaining}`);
  }
  return visible.join('; ');
}

function extractPrettierDiagnostics(check) {
  const diagnostics = [];
  for (const line of outputLines(check)) {
    const match = /^\[warn\]\s+(.+)$/.exec(line.trim());
    if (!match || /^Code style issues found\b/.test(match[1])) {
      continue;
    }
    diagnostics.push({
      file: normalizeSubmissionPath(match[1]),
      message: 'Файл не соответствует форматированию Prettier.',
    });
  }
  return uniqueDiagnostics(diagnostics);
}

function extractEslintDiagnostics(check) {
  const diagnostics = [];
  let currentFile = null;

  for (const rawLine of outputLines(check)) {
    const line = rawLine.trimEnd();
    if (isEslintFilename(line)) {
      currentFile = normalizeSubmissionPath(line.trim());
      continue;
    }

    const match = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/.exec(line);
    if (!match || !currentFile) {
      continue;
    }
    diagnostics.push({
      column: Number(match[2]),
      file: currentFile,
      line: Number(match[1]),
      message: match[4],
      rule: match[5],
      severity: match[3],
    });
  }

  return uniqueDiagnostics(diagnostics);
}

function outputLines(check) {
  return [check.stdout, check.stderr]
    .filter(Boolean)
    .flatMap((output) => sanitizeTerminalOutput(output).split(/\r?\n/));
}

function isEslintFilename(line) {
  const value = line.trim();
  return value.length > 0 && !line.startsWith(' ') && /\.(?:[cm]?[jt]s|tsx?)$/i.test(value);
}

function normalizeSubmissionPath(value) {
  return String(value)
    .replaceAll('\\', '/')
    .replace(/^.*?\/submission\//, '')
    .replace(/^submission\//, '');
}

function formatDiagnostic(diagnostic) {
  const location = [diagnostic.file, diagnostic.line, diagnostic.column]
    .filter((value) => value !== undefined)
    .join(':');
  const rule = diagnostic.rule ? ` ${diagnostic.rule}` : '';
  return `${location}${rule} — ${diagnostic.message}`;
}

function uniqueDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
