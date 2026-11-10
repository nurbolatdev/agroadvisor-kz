const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const prettier = require('eslint-config-prettier/flat')

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    // Tests load modules with require inside jest.isolateModules and after jest.doMock.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  { ignores: ['dist/*', '.expo/*', 'node_modules/*', 'coverage/*', 'src/api/schema.d.ts'] },
])
