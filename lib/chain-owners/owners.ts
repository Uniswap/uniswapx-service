import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@aws-sdk/node-http-handler'
import Joi from 'joi'
import { log } from '../Logging'
import { powertoolsMetric } from '../Metrics'
import { CHAIN_OWNERS_KEY } from './location'

/** Who posts a chain's orders: legacy (this service) or the backend uniswapx service. */
export type PostingOwner = 'legacy' | 'uniswapx'

/**
 * Who writes a chain's order statuses. `draining` is the hand-over gap between legacy and Phase 1
 * (uniswapx's Substreams worker): nobody writes the chain's statuses while it drains.
 */
export type TrackingOwner = 'legacy' | 'draining' | 'phase1'

export type ChainOwner = { posting: PostingOwner; tracking: TrackingOwner }

export const LEGACY_OWNER: ChainOwner = Object.freeze({ posting: 'legacy', tracking: 'legacy' })

/**
 * The owner file's contents:
 *
 *   { "chains": { "1": { "posting": "legacy", "tracking": "legacy" }, ... } }
 *
 * Both services read it with the same rules, so on any chain at most one of them posts and at
 * most one writes statuses:
 * - a chain missing from the file is legacy / legacy;
 * - a file that can't be read, isn't JSON or doesn't match this schema makes every chain
 *   legacy / legacy (fail closed). One bad entry invalidates the whole file, on purpose, so a
 *   typo shows up as an error on every reader rather than as one chain quietly changing hands.
 */
export type ChainOwnersFile = { chains: Record<string, ChainOwner> }

const CHAIN_OWNER_SCHEMA = Joi.object({
  posting: Joi.string().valid('legacy', 'uniswapx').required(),
  tracking: Joi.string().valid('legacy', 'draining', 'phase1').required(),
})

const CHAIN_OWNERS_FILE_SCHEMA = Joi.object({
  chains: Joi.object()
    .pattern(/^[1-9][0-9]*$/, CHAIN_OWNER_SCHEMA)
    .required(),
}).unknown(true)

export function parseChainOwners(raw: string): ChainOwnersFile {
  const { value, error } = CHAIN_OWNERS_FILE_SCHEMA.validate(JSON.parse(raw), { convert: false })
  if (error) {
    throw error
  }
  return value as ChainOwnersFile
}

/** Legacy writes a chain's statuses only while the file names it as the tracking owner. */
export function legacyTracks(owner: ChainOwner): boolean {
  return owner.tracking === 'legacy'
}

export interface ChainOwners {
  /** The chain's owners as of the last read. Never throws: anything unreadable is legacy. */
  ownerOf(chainId: number): Promise<ChainOwner>
}

// The one call the reader makes, so tests can pass a fake.
export type GetObjectClient = {
  send(command: GetObjectCommand): Promise<{ Body?: { transformToString(): Promise<string> } }>
}

// How long a read is reused. A flip reaches every reader within this, so a hand-over waits at
// least this long in `draining` (it already waits longer than one tracking run). Unreadable
// results are reused for the same time, so a failing S3 isn't asked again on every call.
export const CHAIN_OWNERS_TTL_MS = 30_000
// GetObject on a small object answers in tens of ms. These bound a hung read, which a post or a
// tracking poll waits on at most once per TTL.
export const CHAIN_OWNERS_CONNECTION_TIMEOUT_MS = 1_000
export const CHAIN_OWNERS_REQUEST_TIMEOUT_MS = 1_000

export const CHAIN_OWNERS_UNREADABLE_METRIC = 'ChainOwnersUnreadable'

export function createChainOwnersS3Client(): S3Client {
  return new S3Client({
    // The pinned SDK makes maxAttempts + 1 attempts (see createSfnClient), so this is two.
    maxAttempts: 1,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: CHAIN_OWNERS_CONNECTION_TIMEOUT_MS,
      requestTimeout: CHAIN_OWNERS_REQUEST_TIMEOUT_MS,
    }),
  })
}

type CachedRead = { file: ChainOwnersFile | undefined; readAtMs: number }

/** Reads the owner file from S3, reusing each read for CHAIN_OWNERS_TTL_MS. */
export class S3ChainOwners implements ChainOwners {
  private cached?: CachedRead
  private inFlight?: Promise<CachedRead>

  constructor(
    private readonly client: GetObjectClient,
    // Undefined when the deploy didn't set it: every chain is then legacy.
    private readonly bucket: string | undefined,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = CHAIN_OWNERS_TTL_MS
  ) {}

  /** The deployed reader: bucket from CHAIN_OWNERS_BUCKET, one client per process. */
  static fromEnv(): S3ChainOwners {
    return new S3ChainOwners(createChainOwnersS3Client(), process.env.CHAIN_OWNERS_BUCKET || undefined)
  }

  async ownerOf(chainId: number): Promise<ChainOwner> {
    const { file } = await this.read()
    return file?.chains[chainId.toString()] ?? LEGACY_OWNER
  }

  private async read(): Promise<CachedRead> {
    if (this.cached && this.now() - this.cached.readAtMs < this.ttlMs) {
      return this.cached
    }
    // Concurrent callers share one request.
    this.inFlight =
      this.inFlight ??
      this.fetch().then((read) => {
        this.cached = read
        this.inFlight = undefined
        return read
      })
    return this.inFlight
  }

  private async fetch(): Promise<CachedRead> {
    try {
      if (!this.bucket) {
        throw new Error('CHAIN_OWNERS_BUCKET is not set')
      }
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: CHAIN_OWNERS_KEY }))
      if (!res.Body) {
        throw new Error('owner file has no body')
      }
      return { file: parseChainOwners(await res.Body.transformToString()), readAtMs: this.now() }
    } catch (error) {
      log.error('Chain owner file unreadable; treating every chain as legacy', {
        error,
        bucket: this.bucket,
        key: CHAIN_OWNERS_KEY,
      })
      powertoolsMetric.singleMetric().addMetric(CHAIN_OWNERS_UNREADABLE_METRIC, MetricUnits.Count, 1)
      return { file: undefined, readAtMs: this.now() }
    }
  }
}
