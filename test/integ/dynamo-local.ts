// The DynamoDB Local instance @shelf/jest-dynamodb starts for integration tests; its port and
// tables are defined in jest-dynamodb-config.js. DynamoDB Local accepts any credentials.
export const DYNAMO_LOCAL_CONFIG = {
  convertEmptyValues: true,
  endpoint: 'localhost:8000',
  region: 'local-env',
  sslEnabled: false,
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
}
