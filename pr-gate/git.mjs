import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

export async function readEvent(filename) {
  return JSON.parse(await readFile(path.resolve(filename), 'utf8'));
}
