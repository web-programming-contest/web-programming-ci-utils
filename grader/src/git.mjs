import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePrTitle } from './contracts.mjs';
import { pullRequestsForCommit } from './github.mjs';

export function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const details = error.stderr?.trim() || error.message;
    throw new Error(`git ${args.join(' ')} failed: ${details}`, { cause: error });
  }
}

export function listTreeEntries(root, prefix) {
  const output = git(['ls-tree', '-r', '-l', 'HEAD', '--', prefix], root);
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => {
    const match = /^(\d{6})\s+\w+\s+[0-9a-f]+\s+(-|\d+)\t(.+)$/.exec(line);
    if (!match) {
      throw new Error(`Cannot parse git tree entry: ${line}`);
    }
    return { mode: match[1], size: match[2] === '-' ? 0 : Number(match[2]), path: match[3] };
  });
}

export async function discoverBinding({ baseRoot, repository, slug, token, pullLookup }) {
  const commitsOutput = git(['log', '--reverse', '--format=%H', '--', slug], baseRoot);
  if (!commitsOutput) {
    return null;
  }

  const commits = commitsOutput.split('\n').filter(Boolean);
  for (const commit of commits) {
    const pullRequests = await (pullLookup ?? pullRequestsForCommit)(repository, commit, token);
    for (const pullRequest of pullRequests.filter((candidate) => candidate.merged_at)) {
      let title;
      try {
        title = parsePrTitle(pullRequest.title);
      } catch {
        continue;
      }
      if (title.slug !== slug) {
        continue;
      }
      if (!pullRequest.user?.login) {
        throw new Error(
          `Cannot determine the merged PR author for the first accepted commit ${commit}.`,
        );
      }
      return {
        commit,
        lab: title.lab,
        login: pullRequest.user.login,
        pullNumber: pullRequest.number,
        variant: title.variant,
      };
    }
  }

  throw new Error(
    `Directory ${slug} already exists in course history, but its first accepted PR with a valid title cannot be determined.`,
  );
}

export async function readEvent(filename) {
  return JSON.parse(await readFile(path.resolve(filename), 'utf8'));
}
