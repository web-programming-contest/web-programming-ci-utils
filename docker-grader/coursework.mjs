import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonResult } from '../reports/output.mjs';
import { collectCourseworkFiles } from '../shared/coursework-files.mjs';
import { runQualityChecks } from './checks/quality/index.mjs';
import { CheckSuite } from './runtime/check-suite.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function gradeCoursework({ submissionDirectory, resultsDirectory, filenames }) {
  const startedAt = Date.now();
  const files = await collectCourseworkFiles(submissionDirectory, filenames);
  const suite = new CheckSuite();
  await mkdir(resultsDirectory, { recursive: true });
  runQualityChecks({ files, root, suite, kind: 'coursework' });
  const result = {
    kind: 'coursework',
    checks: suite.checks,
    durationMs: Date.now() - startedAt,
    passed: suite.checks.every((check) => check.status !== 'failed'),
    submission: submissionDirectory,
    files: files.map((filename) => path.relative(submissionDirectory, filename)),
  };
  await writeJsonResult(resultsDirectory, 'summary.json', result);
  return result;
}
