import { localBinary } from '../../runtime/check-suite.mjs';

export function runPrettier({ files, root, suite }) {
  suite.run(
    'Prettier',
    localBinary(root, 'prettier'),
    ['--check', '--config', 'docker-grader/config/prettier.json', ...files],
    { cwd: root },
  );
}
