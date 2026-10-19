#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRequiredFiles, validateVariant } from '../docker-grader/submission/contract.mjs';
import { loadTaskBank, resolveTask } from '../docker-grader/tasks/store.mjs';
import { annotateError, writeGithubOutput, writeStepSummary } from '../reports/output.mjs';
import { parseArgs, requiredArg } from '../shared/args.mjs';
import { collectCourseworkFiles, courseworkChangedFiles } from '../shared/coursework-files.mjs';
import { assertStudentConfig } from '../scripts/student-config.mjs';
import { validateChangedPaths, validateTreeEntries } from './changed-files.mjs';
import { listTreeEntries, readEvent } from './git.mjs';
import { listPullRequestFiles } from './github.mjs';
import { findStudentBinding } from './identity.mjs';
import { parsePrTitle } from './title.mjs';

export async function runGate(options) {
  const event = options.event;
  const pullRequest = event.pull_request;
  if (!pullRequest) {
    throw new Error('The event payload does not contain pull_request.');
  }

  const title = parsePrTitle(pullRequest.title);
  const files =
    options.files ??
    (await listPullRequestFiles(pullRequest.url, options.token ?? process.env.GITHUB_TOKEN));
  if (title.kind === 'coursework') {
    const selected = courseworkChangedFiles(files);
    await collectCourseworkFiles(options.headRoot, selected);
    return {
      kind: 'coursework',
      files: selected,
      submissionDirectory: path.resolve(options.headRoot),
      submissionRelative: '.',
    };
  }
  await assertStudentConfig(options.baseRoot);
  const { lab, slug, variant: titleVariant } = title;
  const prefix = validateChangedPaths(files, slug, lab);
  const submissionDirectory = path.resolve(options.headRoot, slug, `lab${lab}`);
  const relative = path.relative(path.resolve(options.headRoot), submissionDirectory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Submission path escapes the checked-out repository.');
  }

  const bank = await loadTaskBank();
  await validateRequiredFiles(submissionDirectory, lab);
  const variant = validateVariant(titleVariant, bank.variants.variantCount);
  const task = await resolveTask(lab, variant);
  const entries = options.treeEntries ?? listTreeEntries(options.headRoot, prefix.slice(0, -1));
  validateTreeEntries(entries, prefix);

  let binding = options.binding;
  if (binding === undefined) {
    binding = await findStudentBinding({
      baseRoot: options.baseRoot,
      repository: pullRequest.base.repo.full_name,
      slug,
      token: options.token ?? process.env.GITHUB_TOKEN,
      pullLookup: options.pullLookup,
    });
  }

  const login = pullRequest.user?.login;
  if (!login) {
    throw new Error('Cannot determine the pull request author.');
  }
  if (binding && binding.login.toLowerCase() !== login.toLowerCase()) {
    throw new Error(
      `Directory ${slug} belongs to GitHub user ${binding.login}; this PR was opened by ${login}.`,
    );
  }
  if (binding && binding.variant !== variant) {
    throw new Error(
      `Variant ${binding.variant} is already bound to ${slug}; PR title contains variant_${variant}.`,
    );
  }

  return {
    binding: binding ?? { login, variant, firstSubmission: true },
    lab,
    login,
    prefix,
    slug,
    submissionDirectory,
    submissionRelative: `${slug}/lab${lab}`,
    task,
    variant,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const eventFile = args.event || process.env.GITHUB_EVENT_PATH;
  if (!eventFile) {
    throw new Error('Provide --event or set GITHUB_EVENT_PATH.');
  }
  const event = await readEvent(eventFile);
  const baseRoot = path.resolve(args['base-root'] || process.cwd());
  const headRoot = path.resolve(args['head-root'] || process.cwd());
  let files;
  if (args['changed-files']) {
    files = JSON.parse(await readFile(path.resolve(requiredArg(args, 'changed-files')), 'utf8'));
  }

  const result = await runGate({ baseRoot, event, files, headRoot });
  await writeGithubOutput({
    kind: result.kind ?? 'lab',
    files: JSON.stringify(result.files ?? []),
    lab: result.lab ?? '',
    submission_dir: result.submissionRelative,
    variant: result.variant ?? '',
  });
  if (result.kind === 'coursework') {
    await writeStepSummary(
      `## Курсовая работа ✅\n\nСтруктура проекта свободная. Проверяются только стиль и код изменённых веб-файлов: ${result.files.length}.`,
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const registration = result.binding.firstSubmission
    ? '\n\nЭто первая принятая работа slug: на защите нужно сверить вариант с таблицей.'
    : '';
  await writeStepSummary(
    `## Submission gate ✅\n\n- Студент: \`${result.slug}\` (GitHub: \`${result.login}\`)\n- Лабораторная: ${result.lab}\n- Вариант: ${result.variant}\n- Задача: ${result.task.title}${registration}`,
  );
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(async (error) => {
    annotateError(error.message);
    await writeStepSummary(`## Submission gate ❌\n\n${error.message}`);
    process.exitCode = 1;
  });
}
