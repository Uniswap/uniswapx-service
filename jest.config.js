const ts_preset = require('ts-jest/jest-preset')
const dynamo_preset = require('@shelf/jest-dynamodb/jest-preset')

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...ts_preset,
  ...dynamo_preset,
  testEnvironment: 'node',
  testPathIgnorePatterns: ['bin/', 'dist/'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  }
}
