import { GetObjectCommand } from '@aws-sdk/client-s3'
import { CHAIN_OWNERS_KEY, chainOwnersBucketName } from '../../../lib/chain-owners/location'
import {
  CHAIN_OWNERS_TTL_MS,
  ChainOwnersFile,
  GetObjectClient,
  LEGACY_OWNER,
  legacyTracks,
  parseChainOwners,
  S3ChainOwners,
} from '../../../lib/chain-owners/owners'
import { powertoolsMetric } from '../../../lib/Metrics'

// Answers GetObject with whatever `body` holds when the call is made, or throws `error`.
class FakeS3 implements GetObjectClient {
  public readonly requests: { Bucket?: string; Key?: string }[] = []
  public body: string | undefined
  public error: Error | undefined

  async send(command: GetObjectCommand) {
    this.requests.push({ Bucket: command.input.Bucket, Key: command.input.Key })
    if (this.error) {
      throw this.error
    }
    const body = this.body
    return body === undefined ? {} : { Body: { transformToString: async () => body } }
  }
}

const FILE: ChainOwnersFile = {
  chains: {
    '1': { posting: 'legacy', tracking: 'legacy' },
    '130': { posting: 'uniswapx', tracking: 'draining' },
    '8453': { posting: 'uniswapx', tracking: 'phase1' },
  },
}

describe('chain owner file', () => {
  let now: number
  let s3: FakeS3
  let unreadable: jest.Mock
  const reader = () => new S3ChainOwners(s3, 'owners-bucket', () => now)

  beforeEach(() => {
    now = 1_000_000
    s3 = new FakeS3()
    s3.body = JSON.stringify(FILE)
    unreadable = jest.fn()
    jest.spyOn(powertoolsMetric, 'singleMetric').mockReturnValue({ addMetric: unreadable } as any)
  })

  afterEach(() => jest.restoreAllMocks())

  it('lives at a per-account bucket the cross-account grants can name', () => {
    expect(chainOwnersBucketName('316116520258')).toEqual('uniswapx-chain-owners-316116520258')
    expect(CHAIN_OWNERS_KEY).toEqual('chain-owners.json')
  })

  it('reads each chain as the file says, from the owner file key', async () => {
    const owners = reader()

    expect(await owners.ownerOf(1)).toEqual({ posting: 'legacy', tracking: 'legacy' })
    expect(await owners.ownerOf(130)).toEqual({ posting: 'uniswapx', tracking: 'draining' })
    expect(await owners.ownerOf(8453)).toEqual({ posting: 'uniswapx', tracking: 'phase1' })
    expect(s3.requests).toEqual([{ Bucket: 'owners-bucket', Key: 'chain-owners.json' }])
    expect(unreadable).not.toHaveBeenCalled()
  })

  it('treats a chain missing from the file as legacy', async () => {
    expect(await reader().ownerOf(10)).toEqual(LEGACY_OWNER)
    expect(unreadable).not.toHaveBeenCalled()
  })

  it('lets legacy track only on chains whose tracking owner is legacy', () => {
    expect(legacyTracks({ posting: 'uniswapx', tracking: 'legacy' })).toBe(true)
    expect(legacyTracks({ posting: 'legacy', tracking: 'draining' })).toBe(false)
    expect(legacyTracks({ posting: 'legacy', tracking: 'phase1' })).toBe(false)
  })

  describe('fails closed: every chain is legacy, and the miss is counted', () => {
    const cases: [string, (s3: FakeS3) => void][] = [
      ['the read fails', (s3) => (s3.error = Object.assign(new Error('Access Denied'), { name: 'AccessDenied' }))],
      ['the object is missing', (s3) => (s3.error = Object.assign(new Error('missing'), { name: 'NoSuchKey' }))],
      ['the object has no body', (s3) => (s3.body = undefined)],
      ['the body is not JSON', (s3) => (s3.body = '{"chains": ')],
      ['chains is missing', (s3) => (s3.body = '{}')],
      [
        'one chain has an unknown owner',
        (s3) =>
          (s3.body = JSON.stringify({
            chains: { ...FILE.chains, '10': { posting: 'legacy', tracking: 'uniswapx' } },
          })),
      ],
      [
        'one chain is missing a field',
        (s3) => (s3.body = JSON.stringify({ chains: { ...FILE.chains, '10': { posting: 'legacy' } } })),
      ],
      [
        'a chain key is not a chain id',
        (s3) => (s3.body = JSON.stringify({ chains: { ...FILE.chains, base: LEGACY_OWNER } })),
      ],
    ]

    it.each(cases)('when %s', async (_, breakIt) => {
      breakIt(s3)
      const owners = reader()

      // 8453 is phase1 in the intended file; unreadable, it reverts to legacy like every chain.
      expect(await owners.ownerOf(8453)).toEqual(LEGACY_OWNER)
      expect(await owners.ownerOf(130)).toEqual(LEGACY_OWNER)
      expect(unreadable).toHaveBeenCalledTimes(1)
      expect(unreadable).toHaveBeenCalledWith('ChainOwnersUnreadable', 'Count', 1)
    })

    it('when the deploy set no bucket, without calling S3', async () => {
      expect(await new S3ChainOwners(s3, undefined, () => now).ownerOf(8453)).toEqual(LEGACY_OWNER)
      expect(s3.requests).toHaveLength(0)
      expect(unreadable).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores unknown top-level fields, so the file can grow without breaking readers', () => {
    expect(parseChainOwners(JSON.stringify({ ...FILE, note: 'base moves 11-05' }))).toEqual({
      ...FILE,
      note: 'base moves 11-05',
    })
  })

  it('reuses a read for the TTL, then reads again and sees the change', async () => {
    const owners = reader()
    expect(await owners.ownerOf(1)).toEqual(LEGACY_OWNER)

    s3.body = JSON.stringify({ chains: { '1': { posting: 'legacy', tracking: 'draining' } } })
    now += CHAIN_OWNERS_TTL_MS - 1
    expect((await owners.ownerOf(1)).tracking).toEqual('legacy')
    expect(s3.requests).toHaveLength(1)

    now += 1
    expect((await owners.ownerOf(1)).tracking).toEqual('draining')
    expect(s3.requests).toHaveLength(2)
  })

  it('reuses a failed read for the TTL too, then recovers', async () => {
    s3.error = new Error('throttled')
    const owners = reader()
    await owners.ownerOf(8453)
    await owners.ownerOf(8453)
    expect(s3.requests).toHaveLength(1)

    s3.error = undefined
    now += CHAIN_OWNERS_TTL_MS
    expect((await owners.ownerOf(8453)).tracking).toEqual('phase1')
    expect(s3.requests).toHaveLength(2)
  })

  it('shares one request between concurrent callers', async () => {
    const owners = reader()

    const results = await Promise.all([owners.ownerOf(1), owners.ownerOf(130), owners.ownerOf(8453)])

    expect(results.map((o) => o.tracking)).toEqual(['legacy', 'draining', 'phase1'])
    expect(s3.requests).toHaveLength(1)
  })
})
