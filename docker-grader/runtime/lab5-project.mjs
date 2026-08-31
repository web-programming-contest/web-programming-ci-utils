import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const entryExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const fallbackEntries = [
  'main.js',
  'main.jsx',
  'main.ts',
  'main.tsx',
  'src/main.js',
  'src/main.jsx',
  'src/main.ts',
  'src/main.tsx',
  'src/index.js',
  'src/index.jsx',
  'src/index.ts',
  'src/index.tsx',
];
const htmlCandidates = ['index.html', 'public/index.html'];
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);

export async function resolveLab5Project(submissionDirectory) {
  const root = path.resolve(submissionDirectory);
  const htmlFiles = await existingRegularFiles(root, htmlCandidates);
  if (htmlFiles.length !== 1) {
    throw new Error('lab5 must contain exactly one of index.html or public/index.html.');
  }

  const htmlFile = htmlFiles[0];
  const html = await readFile(htmlFile, 'utf8');
  const referencedEntries = [];
  for (const source of scriptSources(html)) {
    const resolved = resolveLocalReference(root, htmlFile, source);
    if (
      resolved &&
      entryExtensions.has(path.extname(resolved).toLowerCase()) &&
      (await isRegularFile(resolved))
    ) {
      referencedEntries.push(resolved);
    }
  }

  const entries = unique(
    referencedEntries.length > 0
      ? referencedEntries
      : await existingRegularFiles(root, fallbackEntries),
  );
  if (entries.length !== 1) {
    throw new Error(
      'lab5 must expose exactly one React entry via index.html or a conventional main/src/main/src/index file with a .js, .jsx, .ts, or .tsx extension.',
    );
  }

  const styleFiles = await findFiles(root, (filename) => filename.toLowerCase().endsWith('.css'));
  if (styleFiles.length === 0) {
    throw new Error('lab5 must contain at least one CSS file.');
  }

  return {
    entryFile: entries[0],
    entryRelative: normalizeRelative(root, entries[0]),
    html,
    htmlFile,
    htmlRelative: normalizeRelative(root, htmlFile),
    styleFiles,
  };
}

export async function validateLab5Package(submissionDirectory) {
  const filename = path.join(submissionDirectory, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Required file is missing: package.json', { cause: error });
    }
    if (error instanceof SyntaxError) {
      throw new Error('lab5 package.json must contain valid JSON.', { cause: error });
    }
    throw error;
  }

  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };
  for (const dependency of ['react', 'react-dom']) {
    if (typeof dependencies[dependency] !== 'string') {
      throw new Error(`lab5 package.json must declare ${dependency}.`);
    }
  }
  if (!['vite', 'webpack'].some((dependency) => typeof dependencies[dependency] === 'string')) {
    throw new Error('lab5 package.json must declare either vite or webpack.');
  }
  if (!manifest.scripts || typeof manifest.scripts.build !== 'string') {
    throw new Error('lab5 package.json must declare a build script.');
  }
}

function scriptSources(html) {
  const sources = [];
  const pattern = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/script\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    sources.push(match[2]);
  }
  return sources;
}

function resolveLocalReference(root, htmlFile, value) {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
    return null;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  } catch {
    return null;
  }
  const resolved = pathname.startsWith('/')
    ? path.resolve(root, `.${pathname}`)
    : path.resolve(path.dirname(htmlFile), pathname);
  return isWithin(root, resolved) ? resolved : null;
}

async function existingRegularFiles(root, filenames) {
  const result = [];
  for (const filename of filenames) {
    const resolved = path.resolve(root, filename);
    if (isWithin(root, resolved) && (await isRegularFile(resolved))) {
      result.push(resolved);
    }
  }
  return result;
}

async function findFiles(root, predicate) {
  const result = [];

  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const filename = path.join(current, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        await visit(filename);
      } else if (entry.isFile() && predicate(filename)) {
        result.push(filename);
      }
    }
  }

  await visit(root);
  return result.sort();
}

async function isRegularFile(filename) {
  try {
    const stats = await lstat(filename);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function isWithin(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalizeRelative(root, filename) {
  return path.relative(root, filename).split(path.sep).join('/');
}

function unique(values) {
  return [...new Set(values)];
}
