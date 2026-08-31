import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runEslint } from '../docker-grader/checks/quality/eslint.mjs';
import { runTypescript } from '../docker-grader/checks/quality/typescript.mjs';
import { prepareSite } from '../docker-grader/runtime/prepare-site.mjs';
import { validateRequiredFiles } from '../docker-grader/submission/contract.mjs';
import { validateChangedPaths } from '../pr-gate/changed-files.mjs';

test('lab5 accepts and bundles a Vite-style TypeScript React project', async () => {
  await withTemporaryProject(async ({ output, project }) => {
    await writeProject(project, {
      builder: 'vite',
      entry: 'src/main.tsx',
      html: '<main data-testid="app"></main><script type="module" src="/src/main.tsx"></script>',
      source: reactSource('TypeScript React'),
    });

    await validateRequiredFiles(project, 5);
    await prepareSite(project, output, 5);

    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    const bundle = await readFile(path.join(output, 'main.js'), 'utf8');
    assert.match(html, /src="\/main\.js"/);
    assert.doesNotMatch(html, /src\/main\.tsx/);
    assert.match(html, /href="\/main\.css"/);
    assert.match(bundle, /TypeScript React/);
  });
});

test('lab5 accepts and bundles a Webpack-style JavaScript React project', async () => {
  await withTemporaryProject(async ({ output, project }) => {
    await writeProject(project, {
      builder: 'webpack',
      entry: 'src/index.jsx',
      html: '<main data-testid="app"></main>',
      htmlFile: 'public/index.html',
      source: reactSource('JavaScript React'),
    });

    await validateRequiredFiles(project, 5);
    await prepareSite(project, output, 5);

    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    const bundle = await readFile(path.join(output, 'main.js'), 'utf8');
    assert.match(html, /src="\/main\.js"/);
    assert.match(bundle, /JavaScript React/);
  });
});

test('lab5 rejects a non-React implementation even when the manifest names React', async () => {
  await withTemporaryProject(async ({ output, project }) => {
    await writeProject(project, {
      builder: 'vite',
      entry: 'src/main.js',
      html: '<main data-testid="app"></main><script type="module" src="/src/main.js"></script>',
      source: "document.querySelector('[data-testid=app]').textContent = 'Plain DOM';\n",
    });

    await validateRequiredFiles(project, 5);
    await assert.rejects(() => prepareSite(project, output, 5), /source must import react/);
  });
});

test('lab5 package.json is allowed only at the lab root', () => {
  assert.doesNotThrow(() =>
    validateChangedPaths([{ filename: 'student.name/lab5/package.json' }], 'student.name', 5),
  );
  assert.throws(
    () =>
      validateChangedPaths(
        [{ filename: 'student.name/lab5/nested/package.json' }],
        'student.name',
        5,
      ),
    /dependency manifests are not supported/,
  );
  assert.throws(
    () => validateChangedPaths([{ filename: 'student.name/lab4/package.json' }], 'student.name', 4),
    /dependency manifests are not supported/,
  );
});

test('quality checks include React source files and exclude typed build configs from tsc', () => {
  const files = [
    '/submission/src/main.jsx',
    '/submission/src/App.tsx',
    '/submission/src/model.ts',
    '/submission/vite.config.ts',
  ];
  const eslint = captureSuite();
  runEslint({ files, root: '/grader', suite: eslint });
  assert.deepEqual(eslint.arguments.slice(-4), files);

  const typescript = captureSuite();
  runTypescript({ files, root: '/grader', suite: typescript });
  assert.ok(typescript.arguments.includes('/submission/src/App.tsx'));
  assert.ok(typescript.arguments.includes('/submission/src/model.ts'));
  assert.ok(!typescript.arguments.includes('/submission/vite.config.ts'));
  assert.deepEqual(
    typescript.arguments.slice(
      typescript.arguments.indexOf('--jsx'),
      typescript.arguments.indexOf('--jsx') + 2,
    ),
    ['--jsx', 'react-jsx'],
  );
});

async function writeProject(project, { builder, entry, html, htmlFile = 'index.html', source }) {
  const manifest = {
    dependencies: { react: '18.3.1', 'react-dom': '18.3.1' },
    devDependencies: { [builder]: '1.0.0' },
    scripts: { build: `${builder} build` },
  };
  await writeFile(path.join(project, 'package.json'), JSON.stringify(manifest), 'utf8');
  await writeFile(
    path.join(project, 'README.md'),
    '# Лабораторная работа 5\n\n## Задание\n\nTest\n\n## Реализация\n\nTest\n\n## Запуск\n\nTest\n',
  );
  await writeNested(project, htmlFile, `<!doctype html><html><body>${html}</body></html>`);
  await writeNested(project, entry, `import './styles.css';\n${source}`);
  await writeNested(project, 'src/styles.css', 'body { color: rgb(0 0 0); }\n');
}

function reactSource(text) {
  return `import { createRoot } from 'react-dom/client';
const root = document.querySelector('[data-testid="app"]');
createRoot(root).render(<p>${text}</p>);
`;
}

async function writeNested(root, relative, contents) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, contents, 'utf8');
}

async function withTemporaryProject(operation) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lab5-react-test-'));
  const project = path.join(directory, 'submission');
  const output = path.join(directory, 'output');
  await mkdir(project, { recursive: true });
  try {
    await operation({ output, project });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function captureSuite() {
  return {
    arguments: null,
    run(_name, _command, arguments_) {
      this.arguments = arguments_;
    },
    skip() {},
  };
}
