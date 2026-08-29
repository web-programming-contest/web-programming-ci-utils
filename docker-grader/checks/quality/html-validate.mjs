import { localBinary } from '../../runtime/check-suite.mjs';

export function runHtmlValidate({ files, root, suite }) {
  const htmlFiles = files.filter((filename) => filename.endsWith('.html'));
  if (htmlFiles.length === 0) {
    suite.skip('HTML validation', 'В работе нет HTML-файлов.');
    return;
  }

  suite.run(
    'HTML validation',
    localBinary(root, 'html-validate'),
    ['--config', 'docker-grader/config/htmlvalidate.json', ...htmlFiles],
    { cwd: root },
  );
}
