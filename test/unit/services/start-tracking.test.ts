import { GetObjectCommand } from '@aws-sdk/client-s3'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { GetObjectClient, S3ChainOwners } from '../../../lib/chain-owners/owners'
import { SfnStartTracking } from '../../../lib/services/start-tracking'
import { RecordingStartTracking } from '../../fakes/start-tracking'

// Counts GetObject calls, each answered with an all-legacy file after `delayMs`.
class CountingS3 implements GetObjectClient {
  public requests = 0

  constructor(private readonly delayMs = 0) {}

  async send(_command: GetObjectCommand) {
    this.requests++
    await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    const body = JSON.stringify({ chains: { '1': { posting: 'legacy', tracking: 'legacy' } } })
    return { Body: { transformToString: async () => body } }
  }
}

const ORDER = { orderHash: '0xhash', chainId: 1, quoteId: 'quote', orderType: OrderType.Dutch_V2 }

describe('SfnStartTracking.prepare', () => {
  it.each([
    ['still in flight', 20],
    ['already done', 0],
  ])('leaves start one read to reuse, not a second, when the prepared read is %s', async (_, delayMs) => {
    const s3 = new CountingS3(delayMs)
    const sfn = new RecordingStartTracking()
    const tracking = new SfnStartTracking(sfn, () => 'arn:sm', new S3ChainOwners(s3, 'bucket'))

    const prepared = tracking.prepare(1)
    if (delayMs === 0) await prepared
    expect(await tracking.start(ORDER)).toEqual('started')
    await prepared

    expect(s3.requests).toBe(1)
    expect(sfn.calls).toHaveLength(1)
  })
})
