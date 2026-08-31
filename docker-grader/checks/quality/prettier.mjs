import { localBinary } from '../../runtime/check-suite.mjs';

export function runPrettier({ files, root, suite }) {
  const prettierFiles = files.filter((filename) =>
    /\.(?:cjs|css|html|js|json|jsonc|jsx|md|mdx|mjs|ts|tsx|ya?ml)$/i.test(filename),
  );
  suite.run(
    'Prettier',
    localBinary(root, 'prettier'),
    ['--check', '--config', 'docker-grader/config/prettier.json', ...prettierFiles],
    { cwd: root },
  );
}
