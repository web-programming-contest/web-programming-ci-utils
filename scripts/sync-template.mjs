#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncStudentConfig } from './student-config.mjs';

const utilsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = path.join(path.dirname(utilsRoot), 'web-programming-contest-template');

syncStudentConfig(templateRoot)
  .then((result) => {
    console.log(
      result.updatedFiles.length > 0
        ? `Synchronized ${result.updatedFiles.length} student config files in ${templateRoot}.`
        : `Student config is already synchronized in ${templateRoot}.`,
    );
  })
  .catch((error) => {
    console.error(`Failed to synchronize template: ${error.message}`);
    process.exitCode = 1;
  });
