import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);

export async function collectSourceFiles(directory) {
  const result = [];

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are forbidden: ${filename}`);
      }
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        await visit(filename);
      } else if (entry.isFile() && !isBinaryAsset(filename)) {
        result.push(filename);
      }
    }
  }

  await visit(directory);
  return result.sort();
}

function isBinaryAsset(filename) {
  return /\.(?:avif|gif|ico|jpe?g|png|webp)$/i.test(filename);
}
