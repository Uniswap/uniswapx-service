import { KmsSigner } from '@uniswap/signer'
import { COSIGNATURE } from '../unit/fixtures'

// The service builds its own KmsSigner per priority order, so there is nothing to inject yet:
// this spies on the prototype instead. Spying again on an already spied method reuses the spy,
// so the most recently created FakeCosigner is the one that records.
export class FakeCosigner {
  public readonly digests: string[] = []
  private readonly spy: jest.SpyInstance<Promise<string>, [digest: Buffer | string]>

  constructor(public cosignature: string = COSIGNATURE) {
    this.spy = jest.spyOn(KmsSigner.prototype, 'signDigest').mockImplementation(async (digest) => {
      this.digests.push(typeof digest === 'string' ? digest : `0x${digest.toString('hex')}`)
      return this.cosignature
    })
  }

  restore(): void {
    this.spy.mockRestore()
  }
}
