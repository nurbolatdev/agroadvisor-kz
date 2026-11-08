const preset = require('jest-expo/jest-preset')

module.exports = {
  ...preset,
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    '^@/(.*)$': '<rootDir>/src/$1',
    // The "react-native" export of lucide points to ESM; tests use its CommonJS build.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  // @formatjs (the Intl.PluralRules polyfill) is published as ES modules: babel has to compile it for jest.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@formatjs))',
    ...preset.transformIgnorePatterns.slice(1),
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/android/', '/ios/'],
}
