import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const commitPattern = /^[0-9a-f]{40}$/i;
const workflowNames = ['submission.yml', 'progress-report.yml'];
const progressSchedule = {
  cron: '30 0 * * 1',
  timezone: 'Europe/Moscow',
};

export function resolveUtilsCommit(utilsRoot, options = {}) {
  if (options.sha) {
    return validateCommit(options.sha);
  }

  if (!options.allowDirty) {
    const status = runGit(utilsRoot, ['status', '--porcelain']);
    if (status) {
      throw new Error(
        'web-programming-ci-utils contains uncommitted changes. Commit them first or pass --sha explicitly.',
      );
    }
  }

  return validateCommit(runGit(utilsRoot, ['rev-parse', '--verify', 'HEAD^{commit}']));
}

export async function updateWorkflowRefs(repositoryRoot, sha) {
  const normalizedSha = validateCommit(sha);
  const root = path.resolve(repositoryRoot);
  const updates = [];

  for (const workflowName of workflowNames) {
    const filename = path.join(root, '.github', 'workflows', workflowName);
    const contents = await readFile(filename, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') {
        throw new Error(`Required caller workflow is missing: ${filename}`);
      }
      throw error;
    });
    const synchronizedContents =
      workflowName === 'progress-report.yml'
        ? patchProgressSchedule(contents, filename)
        : contents;
    updates.push({
      contents: patchWorkflow(synchronizedContents, normalizedSha, filename),
      filename,
    });
  }

  for (const update of updates) {
    await writeFile(update.filename, update.contents, 'utf8');
  }

  return {
    repositoryRoot: root,
    sha: normalizedSha,
    workflows: updates.map(({ filename }) => filename),
  };
}

export async function syncProgressSchedule(repositoryRoot) {
  const filename = path.join(
    path.resolve(repositoryRoot),
    '.github',
    'workflows',
    'progress-report.yml',
  );
  const contents = await readFile(filename, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') {
      throw new Error(`Required caller workflow is missing: ${filename}`);
    }
    throw error;
  });
  const synchronizedContents = patchProgressSchedule(contents, filename);
  if (synchronizedContents !== contents) {
    await writeFile(filename, synchronizedContents, 'utf8');
  }
  return filename;
}

export function parseOptions(argv) {
  const options = { repositories: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-dirty') {
      options[toCamelCase(argument.slice(2))] = true;
      continue;
    }
    if (argument === '--help') {
      options.help = true;
      continue;
    }
    if (['--repo', '--sha'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === '--repo') {
        options.repositories.push(value);
      } else {
        options.sha = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function uniquePaths(paths) {
  return [...new Set(paths.map((item) => path.resolve(item)))];
}

function patchWorkflow(contents, sha, filename) {
  const usesPattern =
    /^(\s*uses:\s*[^\s#]+\/web-programming-ci-utils\/\.github\/workflows\/[^@\s]+@)([0-9a-f]{40})(\s*(?:#.*)?)$/gim;
  const refPattern = /^(\s*utils_ref:\s*["']?)([0-9a-f]{40})(["']?\s*(?:#.*)?)$/gim;
  const uses = replaceExactlyOnce(contents, usesPattern, sha, `${filename}: uses`);
  return replaceExactlyOnce(uses, refPattern, sha, `${filename}: utils_ref`);
}

function patchProgressSchedule(contents, filename) {
  const pattern =
    /^([ \t]*)-[ \t]+cron:[^\r\n]*(\r?\n)(?:\1[ \t]+timezone:[^\r\n]*(\r?\n|$))?/gm;
  let matches = 0;
  const result = contents.replace(
    pattern,
    (_match, indent, cronEol, timezoneEol) => {
      matches += 1;
      return `${indent}- cron: "${progressSchedule.cron}"${cronEol}${indent}  timezone: "${progressSchedule.timezone}"${timezoneEol ?? cronEol}`;
    },
  );
  if (matches !== 1) {
    throw new Error(
      `${filename}: schedule must contain exactly one cron entry; found ${matches}.`,
    );
  }
  return result;
}

function replaceExactlyOnce(contents, pattern, sha, label) {
  let matches = 0;
  const result = contents.replace(pattern, (_match, prefix, _oldSha, suffix) => {
    matches += 1;
    return `${prefix}${sha}${suffix}`;
  });
  if (matches !== 1) {
    throw new Error(
      `${label} must contain exactly one full 40-character commit SHA; found ${matches}.`,
    );
  }
  return result;
}

export async function isCallerRepository(repositoryRoot) {
  for (const workflowName of workflowNames) {
    try {
      if (!(await stat(path.join(repositoryRoot, '.github', 'workflows', workflowName))).isFile()) {
        return false;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
  return true;
}

function runGit(root, arguments_) {
  try {
    return execFileSync('git', ['-C', root, ...arguments_], { encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error(`Git command failed in ${root}: ${error.stderr?.trim() || error.message}`, {
      cause: error,
    });
  }
}

function validateCommit(value) {
  const sha = String(value).trim().toLowerCase();
  if (!commitPattern.test(sha)) {
    throw new Error(`Expected a full 40-character Git commit SHA, received: ${value}`);
  }
  return sha;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}
