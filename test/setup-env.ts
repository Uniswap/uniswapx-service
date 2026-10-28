// Defaults for the env the post path reads at request time (lib/util/stateMachineArn.ts and the
// Priority cosigner in OrderPoster), so no test needs a .env. A test that asserts on one
// of these values still sets it itself.
process.env.KMS_KEY_ID ??= 'test-kms-key'
process.env.REGION ??= 'us-east-2'
process.env.ACCOUNT_ID ??= '123456789012'
process.env.STATE_MACHINE_NAMES ??= JSON.stringify(
  Object.fromEntries([1, 10, 137, 8453, 42161, 11155111].map((chainId) => [chainId, `test-tracker-${chainId}`]))
)
