import path from 'node:path';
import { localBinary } from '../../runtime/check-suite.mjs';

export function runEslint({ files, root, suite }) {
  const scriptFiles = files.filter((filename) => /\.(?:[cm]?js|jsx|tsx?)$/.test(filename));
  if (scriptFiles.length === 0) {
    suite.skip('ESLint', 'В работе нет JavaScript/TypeScript-файлов.');
    return;
  }

  suite.run(
    'ESLint',
    localBinary(root, 'eslint'),
    [
      '--no-ignore',
      '--no-config-lookup',
      '--max-warnings',
      '0',
      '--config',
      path.join(root, 'docker-grader/config/eslint.config.mjs'),
      ...scriptFiles,
    ],
    { cwd: path.parse(root).root },
  );
}
