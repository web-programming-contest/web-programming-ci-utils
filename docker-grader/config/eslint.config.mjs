import js from '@eslint/js';
import globals from 'globals';
import path from 'node:path';
import tseslint from 'typescript-eslint';

const filesystemRoot = path.parse(import.meta.dirname).root;

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    basePath: filesystemRoot,
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
      sourceType: 'module',
    },
    rules: {
      'array-callback-return': 'error',
      camelcase: ['error', { properties: 'never' }],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'new-cap': 'error',
      'no-array-constructor': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-implied-eval': 'error',
      'no-multi-assign': 'error',
      'no-new-object': 'error',
      'no-new-wrappers': 'error',
      'no-proto': 'error',
      'no-shadow': 'error',
      'no-throw-literal': 'error',
      'no-undef-init': 'error',
      'no-unneeded-ternary': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
      'prefer-template': 'error',
      'quote-props': ['error', 'as-needed'],
      radix: 'error',
      'spaced-comment': ['error', 'always', { markers: ['/'] }],
    },
  },
  {
    basePath: filesystemRoot,
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      'no-array-constructor': 'off',
    },
  },
  {
    basePath: filesystemRoot,
    files: ['**/{vite,webpack}.config.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
