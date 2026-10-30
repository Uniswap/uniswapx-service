/**
 * Where the chain owner file lives: one S3 object per order-service account (so one per stage),
 * which says for each chain who posts its orders and who tracks their status during the move to
 * the backend `uniswapx` service. Legacy and uniswapx (cross-account, through the IAM stack's
 * roles) both read it.
 *
 * The name is derived from the account rather than created by CDK and passed around, so the
 * cross-account grants and the readers in another account can name it without a stack output.
 */
export const CHAIN_OWNERS_KEY = 'chain-owners.json'

export function chainOwnersBucketName(accountId: string): string {
  return `uniswapx-chain-owners-${accountId}`
}
