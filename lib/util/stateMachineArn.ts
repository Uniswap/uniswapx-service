import { checkDefined } from '../preconditions/preconditions'

/**
 * Resolves a chain's order-status-tracking state machine ARN.
 *
 * Lambda caps all env vars at 4KB, so the CDK publishes a `STATE_MACHINE_NAMES`
 * map of chainId -> state machine name rather than a full ARN per chain, and
 * this rebuilds the ARN from a name plus `REGION` / `ACCOUNT_ID`.
 */
export function getStateMachineArn(chainId: number): string {
  const raw = process.env.STATE_MACHINE_NAMES
  if (!raw) {
    // Explicit, because checkDefined admits '' and the failure would otherwise
    // surface as an opaque JSON.parse SyntaxError.
    throw new Error('STATE_MACHINE_NAMES is undefined')
  }
  const names = JSON.parse(raw) as Record<string, string>
  const name = checkDefined(names[chainId.toString()], `No state machine configured for chain ${chainId}`)
  const region = checkDefined(process.env.REGION, 'REGION is undefined')
  const accountId = checkDefined(process.env.ACCOUNT_ID, 'ACCOUNT_ID is undefined')
  return `arn:aws:states:${region}:${accountId}:stateMachine:${name}`
}
