import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { resolveLab5Project } from './lab5-project.mjs';

const graderRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const localScriptPattern =
  /<script\b[^>]*\bsrc\s*=\s*(["'])(?![a-z][a-z\d+.-]*:|\/\/).*?\1[^>]*>\s*<\/script\s*>/gi;

export async function prepareSite(submissionDirectory, outputDirectory, lab) {
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await copySubmission(submissionDirectory, outputDirectory);

  if (lab === 5) {
    return prepareReactSite(submissionDirectory, outputDirectory);
  }
  return prepareLegacySite(submissionDirectory, outputDirectory);
}

async function prepareReactSite(submissionDirectory, outputDirectory) {
  const project = await resolveLab5Project(submissionDirectory);
  await copyPublicDirectory(submissionDirectory, outputDirectory);

  const result = await build({
    absWorkingDir: submissionDirectory,
    assetNames: 'assets/[name]-[hash]',
    bundle: true,
    chunkNames: 'chunks/[name]-[hash]',
    entryNames: 'main',
    entryPoints: [project.entryRelative],
    format: 'esm',
    jsx: 'automatic',
    loader: {
      '.avif': 'file',
      '.gif': 'file',
      '.jpeg': 'file',
      '.jpg': 'file',
      '.png': 'file',
      '.svg': 'file',
      '.webp': 'file',
      '.woff': 'file',
      '.woff2': 'file',
    },
    logLevel: 'warning',
    metafile: true,
    nodePaths: [path.join(graderRoot, 'node_modules')],
    outdir: outputDirectory,
    platform: 'browser',
    sourcemap: true,
    target: ['es2022'],
  });
  assertReactBundle(result.metafile);

  const cssBundle = Object.keys(result.metafile.outputs).find((filename) =>
    filename.endsWith('.css'),
  );
  const html = rewriteReactHtml(project.html, cssBundle ? path.basename(cssBundle) : null);
  await writeFile(path.join(outputDirectory, 'index.html'), html, 'utf8');
  return outputDirectory;
}

async function prepareLegacySite(submissionDirectory, outputDirectory) {
  const typescriptEntry = path.join(submissionDirectory, 'main.ts');
  try {
    await readFile(typescriptEntry, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return outputDirectory;
    }
    throw error;
  }

  await build({
    absWorkingDir: submissionDirectory,
    bundle: true,
    entryPoints: ['main.ts'],
    format: 'esm',
    logLevel: 'warning',
    outfile: path.join(outputDirectory, 'main.js'),
    platform: 'browser',
    sourcemap: true,
    target: ['es2022'],
  });
  const htmlFile = path.join(outputDirectory, 'index.html');
  const html = await readFile(htmlFile, 'utf8');
  await writeFile(htmlFile, html.replace(/(["'])(?:\.\/|\/)?main\.ts\1/g, '$1/main.js$1'));
  return outputDirectory;
}

async function copySubmission(submissionDirectory, outputDirectory) {
  await cp(submissionDirectory, outputDirectory, {
    recursive: true,
    filter(source) {
      const basename = path.basename(source);
      return !['.git', 'dist', 'node_modules'].includes(basename);
    },
  });
}

async function copyPublicDirectory(submissionDirectory, outputDirectory) {
  const publicDirectory = path.join(submissionDirectory, 'public');
  let entries;
  try {
    entries = await readdir(publicDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === 'index.html' || entry.isSymbolicLink()) {
      continue;
    }
    await cp(path.join(publicDirectory, entry.name), path.join(outputDirectory, entry.name), {
      recursive: true,
    });
  }
}

function rewriteReactHtml(html, cssBundle) {
  let result = html.replace(localScriptPattern, '');
  if (cssBundle && !result.includes(`/${cssBundle}`)) {
    const stylesheet = `<link rel="stylesheet" href="/${cssBundle}" />`;
    result = /<\/head\s*>/i.test(result)
      ? result.replace(/<\/head\s*>/i, `    ${stylesheet}\n  </head>`)
      : `${stylesheet}\n${result}`;
  }
  const script = '<script type="module" src="/main.js"></script>';
  if (/<\/body\s*>/i.test(result)) {
    result = result.replace(/<\/body\s*>/i, `    ${script}\n  </body>`);
  } else {
    result += `\n${script}\n`;
  }
  return result;
}

function assertReactBundle(metafile) {
  const inputs = Object.keys(metafile.inputs).map((filename) => filename.replaceAll('\\', '/'));
  for (const dependency of ['react', 'react-dom']) {
    if (!inputs.some((filename) => filename.includes(`/node_modules/${dependency}/`))) {
      throw new Error(`lab5 source must import ${dependency}.`);
    }
  }
}
