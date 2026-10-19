import globals from 'globals';
import path from 'node:path';
import base from './eslint.config.mjs';

export default [
  ...base,
  {
    basePath: path.parse(import.meta.dirname).root,
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    basePath: path.parse(import.meta.dirname).root,
    files: ['**/*.{js,cjs}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
