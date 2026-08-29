import { localBinary } from '../../runtime/check-suite.mjs';

export function runTypescript({ files, root, suite }) {
  const typescriptFiles = files.filter((filename) => filename.endsWith('.ts'));
  if (typescriptFiles.length === 0) {
    suite.skip('TypeScript strict mode', 'В работе нет TypeScript-файлов.');
    return;
  }

  suite.run(
    'TypeScript strict mode',
    localBinary(root, 'tsc'),
    [
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--lib',
      'ES2022,DOM',
      '--skipLibCheck',
      ...typescriptFiles,
    ],
    { cwd: root },
  );
}
