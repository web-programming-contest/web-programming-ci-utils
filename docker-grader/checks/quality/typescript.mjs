import path from 'node:path';
import { localBinary } from '../../runtime/check-suite.mjs';

const buildConfigPattern = /(?:^|\/)(?:vite|webpack)\.config\.[cm]?ts$/;

export function runTypescript({ files, root, suite }) {
  const typescriptFiles = files.filter(
    (filename) =>
      /\.tsx?$/.test(filename) && !buildConfigPattern.test(filename.replaceAll('\\', '/')),
  );
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
      '--jsx',
      'react-jsx',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--lib',
      'ES2022,DOM,DOM.Iterable',
      '--skipLibCheck',
      '--typeRoots',
      path.join(root, 'node_modules/@types'),
      ...typescriptFiles,
    ],
    { cwd: root },
  );
}
