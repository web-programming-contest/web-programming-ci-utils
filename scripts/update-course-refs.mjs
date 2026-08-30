#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseOptions,
  resolveUtilsCommit,
  uniquePaths,
  updateWorkflowRefs,
} from './workflow-refs.mjs';
import { syncStudentConfig } from './student-config.mjs';

const utilsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.dirname(utilsRoot);

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sha = resolveUtilsCommit(utilsRoot, options);
  const targets = uniquePaths([
    path.join(workspaceRoot, 'web-programming-contest-template'),
    ...options.repositories,
  ]);

  for (const target of targets) {
    await updateWorkflowRefs(target, sha);
    const config = await syncStudentConfig(target);
    console.log(
      `Updated ${path.relative(process.cwd(), target) || '.'} -> ${sha}; synchronized ${config.updatedFiles.length} config file(s).`,
    );
  }
}

function printHelp() {
  console.log(`Usage: node scripts/update-course-refs.mjs [options]

Updates submission.yml and progress-report.yml in the contest template and in
every course repository explicitly passed with --repo. Also synchronizes the
canonical progress report schedule from ci-utils.

Options:
  --sha SHA          Pin an explicit full commit SHA instead of utils HEAD
  --repo PATH        Add a course repository explicitly; may be repeated
  --allow-dirty      Allow deriving HEAD while utils has uncommitted changes
  --help             Show this message`);
}

main().catch((error) => {
  console.error(`Failed to update course refs: ${error.message}`);
  process.exitCode = 1;
});
