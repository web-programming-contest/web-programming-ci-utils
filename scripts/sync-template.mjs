#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncStudentConfig } from './student-config.mjs';
import { syncProgressSchedule } from './workflow-refs.mjs';

const utilsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = path.join(path.dirname(utilsRoot), 'web-programming-contest-template');

async function main() {
  await syncProgressSchedule(templateRoot);
  const result = await syncStudentConfig(templateRoot);
  console.log(
    result.updatedFiles.length > 0
      ? `Synchronized progress schedule and ${result.updatedFiles.length} student config files in ${templateRoot}.`
      : `Progress schedule and student config are already synchronized in ${templateRoot}.`,
  );
}

main().catch((error) => {
  console.error(`Failed to synchronize template: ${error.message}`);
  process.exitCode = 1;
});
