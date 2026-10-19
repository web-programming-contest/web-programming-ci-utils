import { localBinary } from '../../runtime/check-suite.mjs';

export function runPrettier({ files, root, suite, kind }) {
  const prettierFiles = files.filter((filename) =>
    (kind === 'coursework'
      ? /\.(?:[cm]?js|[cm]?ts|css|scss|less|html|jsonc?|jsx|mdx?|tsx|ya?ml)$/i
      : /\.(?:cjs|css|html|js|json|jsonc|jsx|md|mdx|mjs|ts|tsx|ya?ml)$/i
    ).test(filename),
  );
  if (prettierFiles.length === 0) {
    suite.skip('Prettier', 'Нет файлов поддерживаемых форматов.');
    return;
  }
  suite.run(
    'Prettier',
    localBinary(root, 'prettier'),
    ['--check', '--config', 'docker-grader/config/prettier.json', ...prettierFiles],
    { cwd: root },
  );
}
