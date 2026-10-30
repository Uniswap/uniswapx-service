import { ChainOwner, ChainOwners, LEGACY_OWNER } from '../../lib/chain-owners/owners'

// Stands in for the owner file: chains not listed are legacy / legacy, as in the real reader.
export class FixedChainOwners implements ChainOwners {
  public readonly reads: number[] = []

  constructor(private readonly owners: Record<number, Partial<ChainOwner>> = {}) {}

  async ownerOf(chainId: number): Promise<ChainOwner> {
    this.reads.push(chainId)
    return { ...LEGACY_OWNER, ...this.owners[chainId] }
  }
}

// Today's file: every chain on legacy.
export const allLegacy = (): FixedChainOwners => new FixedChainOwners()
