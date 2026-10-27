const project = {
  testEnvironment: 'node',
  // Compiled copies (yarn build runs before the tests in CI) would otherwise shadow __mocks__/.
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/cdk.out/'],
  transform: {
    // swc rather than ts-jest: the initial compile takes ~1 second instead of 6-12.
    // https://swc.rs/docs/usage/jest#usage
    '^.+\\.(t|j)s?$': '@swc/jest',
  },
}

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...project,
      displayName: 'unit',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      testMatch: ['<rootDir>/test/unit/**/*.test.ts', '<rootDir>/test/factories/**/*.test.ts'],
    },
    {
      ...project,
      displayName: 'integ',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      // Only integ starts DynamoDB Local (and so needs Java); the preset's own test environment is not used.
      preset: '@shelf/jest-dynamodb',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integ/**/*.test.ts'],
    },
    {
      ...project,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.test.ts'],
    },
  ],
  // Global, so CI gates on unit + integ coverage merged.
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },
}
