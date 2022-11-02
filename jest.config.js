const ts_preset = require('ts-jest/jest-preset')
const dynamo_preset = require('@shelf/jest-dynamodb/jest-preset')

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...ts_preset,
  ...dynamo_preset,
  testEnvironment: 'node',
  testPathIgnorePatterns: ['bin', 'dist'],
  collectCoverageFrom: ['**/*.ts', '!**/build/**', '!**/node_modules/**', '!**/dist/**', '!**/bin/**'],
}
