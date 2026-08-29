import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`,
  );
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

export async function writeStepSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

export async function writeJsonResult(directory, name, value) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}

export function annotateError(message) {
  const safe = String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::error title=Course grader::${safe}`);
}
