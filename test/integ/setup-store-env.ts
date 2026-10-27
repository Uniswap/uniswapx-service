// The order store's client (lib/repositories/store-client.ts) takes its endpoint, region and
// credentials from the environment. Point it at the DynamoDB Local instance jest-dynamodb starts,
// with the same region and key as the toolbox client in dynamo-local.ts: DynamoDB Local keeps a
// separate set of tables per key and region.
process.env.AWS_ENDPOINT_URL_DYNAMODB = 'http://localhost:8000'
process.env.AWS_REGION = 'local-env'
process.env.AWS_ACCESS_KEY_ID = 'fakeMyKeyId'
process.env.AWS_SECRET_ACCESS_KEY = 'fakeSecretAccessKey'
