import { getStateMachineArn } from '../../../lib/util/stateMachineArn'

describe('getStateMachineArn', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    process.env = { ...OLD_ENV }
    process.env.REGION = 'us-east-2'
    process.env.ACCOUNT_ID = '123456789012'
    process.env.STATE_MACHINE_NAMES = JSON.stringify({
      1: 'GoudaServicebetaOrderStatusTracking1-abc123',
      57073: 'GoudaServicebetaOrderStatusTracking57073-def456',
    })
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it('rebuilds the full ARN from name + region + account', () => {
    expect(getStateMachineArn(1)).toEqual(
      'arn:aws:states:us-east-2:123456789012:stateMachine:GoudaServicebetaOrderStatusTracking1-abc123'
    )
  })

  it('builds an ARN matching the real deployed shape', () => {
    expect(getStateMachineArn(57073)).toEqual(
      'arn:aws:states:us-east-2:123456789012:stateMachine:GoudaServicebetaOrderStatusTracking57073-def456'
    )
  })

  it('throws a chain-specific error for an unconfigured chain', () => {
    expect(() => getStateMachineArn(999999)).toThrow('No state machine configured for chain 999999')
  })

  it('throws when STATE_MACHINE_NAMES is absent', () => {
    delete process.env.STATE_MACHINE_NAMES
    expect(() => getStateMachineArn(1)).toThrow('STATE_MACHINE_NAMES is undefined')
  })

  it('throws when STATE_MACHINE_NAMES is set but empty', () => {
    process.env.STATE_MACHINE_NAMES = ''
    expect(() => getStateMachineArn(1)).toThrow('STATE_MACHINE_NAMES is undefined')
  })
})
