const preset = require('jest-expo/jest-preset')

module.exports = {
  ...preset,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // The "react-native" export of lucide points to ESM; tests use its CommonJS build.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/android/', '/ios/'],
}
