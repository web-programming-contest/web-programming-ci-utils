#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCallerRepository,
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
  const candidates = options.repositories.length
    ? options.repositories
    : [
        path.join(workspaceRoot, 'web-programming-ci-test'),
        path.join(workspaceRoot, 'workdir', 'web-programming-ci-test'),
      ];
  const targets = [];
  for (const candidate of uniquePaths(candidates)) {
    if (options.repositories.length || (await isCallerRepository(candidate))) {
      targets.push(candidate);
    }
  }
  if (targets.length === 0) {
    throw new Error('No local web-programming-ci-test repository was found.');
  }

  for (const target of targets) {
    await updateWorkflowRefs(target, sha);
    const config = await syncStudentConfig(target);
    console.log(
      `Updated ${path.relative(process.cwd(), target) || '.'} -> ${sha}; synchronized ${config.updatedFiles.length} config file(s).`,
    );
  }
}

function printHelp() {
  console.log(`Usage: node scripts/update-ci-test-ref.mjs [options]

Updates both local web-programming-ci-test copies by default.

Options:
  --sha SHA          Pin an explicit full commit SHA instead of utils HEAD
  --repo PATH        Update only the given test repository; may be repeated
  --allow-dirty      Allow deriving HEAD while utils has uncommitted changes
  --help             Show this message`);
}

main().catch((error) => {
  console.error(`Failed to update CI test refs: ${error.message}`);
  process.exitCode = 1;
});
