import { PriorityCosigner } from '../../lib/models/PriorityOrder'
import { COSIGNATURE } from '../unit/fixtures'

// Stands in for the KMS signer: records each digest it signs and returns a fixed cosignature.
export class FakeCosigner implements PriorityCosigner {
  public readonly digests: string[] = []

  constructor(public cosignature: string = COSIGNATURE) {}

  async signDigest(digest: Buffer | string): Promise<string> {
    this.digests.push(typeof digest === 'string' ? digest : `0x${digest.toString('hex')}`)
    return this.cosignature
  }
}
