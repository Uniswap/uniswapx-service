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
      lines: 80,
    },
  },
  transform: {
    // Use swc to speed up ts-jest's sluggish compilation times.
    // Using this cuts the initial time to compile from 6-12 seconds to
    // ~1 second consistently.
    // Inspiration from: https://github.com/kulshekhar/ts-jest/issues/259#issuecomment-1332269911
    //
    // https://swc.rs/docs/usage/jest#usage
    '^.+\\.(t|j)s?$': '@swc/jest',
  },
}
