import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

export async function prepareSite(submissionDirectory, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  await cp(submissionDirectory, outputDirectory, {
    recursive: true,
    filter(source) {
      const basename = path.basename(source);
      return basename !== '.git' && basename !== 'node_modules';
    },
  });

  const typescriptEntry = path.join(submissionDirectory, 'main.ts');
  try {
    await readFile(typescriptEntry, 'utf8');
  } catch {
    return outputDirectory;
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
  await writeFile(htmlFile, html.replace(/(["'])\.\/?main\.ts\1/g, '$1main.js$1'));
  return outputDirectory;
}
