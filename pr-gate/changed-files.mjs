import path from 'node:path';

const imageExtensions = new Set(['.avif', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.webp']);
const maxTextFileBytes = 1024 * 1024;
const maxImageFileBytes = 5 * 1024 * 1024;
const maxSubmissionBytes = 20 * 1024 * 1024;

export function validateChangedPaths(files, slug, lab) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('The pull request does not contain changed files.');
  }

  const prefix = `${slug}/lab${lab}/`;
  for (const file of files) {
    const candidates = [file.filename, file.previous_filename].filter(Boolean);
    for (const filename of candidates) {
      validateRepositoryPath(filename, {
        packageManifestPath: lab === 5 ? `${prefix}package.json` : null,
      });
      if (!filename.startsWith(prefix)) {
        throw new Error(`File outside the only allowed directory ${prefix}: ${filename}`);
      }
    }
  }
  return prefix;
}

export function validateTreeEntries(entries, prefix) {
  let totalSize = 0;
  const packageManifestPath = /(?:^|\/)lab5\/$/.test(prefix) ? `${prefix}package.json` : null;

  for (const entry of entries) {
    validateRepositoryPath(entry.path, { packageManifestPath });
    if (!entry.path.startsWith(prefix)) {
      continue;
    }
    if (entry.mode === '120000') {
      throw new Error(`Symbolic links are forbidden: ${entry.path}`);
    }
    if (entry.mode === '160000') {
      throw new Error(`Git submodules are forbidden: ${entry.path}`);
    }
    if (entry.mode === '100755') {
      throw new Error(`Executable files are forbidden: ${entry.path}`);
    }

    const size = Number(entry.size ?? 0);
    const extension = path.extname(entry.path).toLowerCase();
    const relative = entry.path.slice(prefix.length);
    if (imageExtensions.has(extension)) {
      if (!relative.startsWith('assets/')) {
        throw new Error(`Binary images are only allowed under assets/: ${entry.path}`);
      }
      if (size > maxImageFileBytes) {
        throw new Error(`Image exceeds 5 MiB: ${entry.path}`);
      }
    } else if (size > maxTextFileBytes) {
      throw new Error(`File exceeds 1 MiB: ${entry.path}`);
    }
    totalSize += size;
  }

  if (totalSize > maxSubmissionBytes) {
    throw new Error('Submission exceeds the total size limit of 20 MiB.');
  }
}

function validateRepositoryPath(filename, { packageManifestPath = null } = {}) {
  const parts = filename.split('/');
  if (
    path.posix.isAbsolute(filename) ||
    filename.includes('\\') ||
    parts.some((part) => ['..', '.git', '.github', 'dist', 'node_modules'].includes(part))
  ) {
    throw new Error(`Unsafe repository path: ${filename}`);
  }
  const basename = parts.at(-1);
  if (
    ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(basename) ||
    (basename === 'package.json' && filename !== packageManifestPath)
  ) {
    throw new Error(`Student dependency manifests are not supported: ${filename}`);
  }
}
