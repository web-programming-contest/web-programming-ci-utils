import { localBinary } from '../../runtime/check-suite.mjs';

export function runStylelint({ files, root, suite }) {
  const cssFiles = files.filter((filename) => filename.endsWith('.css'));
  if (cssFiles.length === 0) {
    suite.skip('Stylelint', 'В работе нет CSS-файлов.');
    return;
  }

  suite.run(
    'Stylelint',
    localBinary(root, 'stylelint'),
    ['--config', 'docker-grader/config/stylelint.json', ...cssFiles],
    { cwd: root },
  );
}
