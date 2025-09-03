import js from '@eslint/js'
import configPrettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import prettierPlugin from 'eslint-plugin-prettier'
import * as tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    files: ['**/*.{js,jsx,ts,tsx,json}'],
  },
  {
    plugins: {
      prettier: prettierPlugin,
      '@typescript-eslint': tseslint.plugin,
    },
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  configPrettier,
  importPlugin.flatConfigs.recommended,
  {
    rules: {
      curly: ['warn', 'multi-line', 'consistent'],
      eqeqeq: 'error',
      'no-console': 'off',
      'no-inner-declarations': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true,
        },
      ],
      'import/export': 'error',
      'import/no-duplicates': ['error'],
      'import/no-unresolved': ['error', { commonjs: true, amd: true }],
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
          ],
          'newlines-between': 'never',
          pathGroups: [
            {
              pattern: 'react',
              group: 'builtin',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-use-before-define': 'off',
    },
    settings: {
      react: { version: 'detect' },
      'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
      'import/parsers': {
        '@typescript-eslint/parser': ['.js', '.jsx', '.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: true,
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
          paths: ['src'],
        },
      },
    },
  },
  {
    ignores: ['dist/'],
  },
  {
    files: ['src'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
  {
    ignores: ['dist/', 'jotai/**', 'jotai-effect/**'],
  },
  {
    files: ['tests/**/*.tsx', 'tests/**/*'],
    rules: {},
  },
  {
    files: ['./*.js'],
    rules: {},
  }
)
