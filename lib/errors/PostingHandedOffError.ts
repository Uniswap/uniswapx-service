// The chain owner file names uniswapx as the chain's posting owner, so legacy doesn't store the order.
export class PostingHandedOffError extends Error {
  constructor(public readonly chainId: number) {
    super(`Orders on chainId ${chainId} are no longer accepted by this service`)
  }
}
