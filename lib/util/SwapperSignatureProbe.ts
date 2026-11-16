import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { CosignedPriorityOrder, CosignedV2DutchOrder, CosignedV3DutchOrder, DutchOrder } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ProviderMap } from '../handlers/shared'
import { SWAPPER_SIGNATURE_PROBE_TIMEOUT_MS } from './constants'
import { ERC1271_INTERFACE, isErc1271MagicValue } from './OrderSignatureValidator'

/**
 * What the swapper answered isValidSignature(digest, signature) with:
 * - `magic`: the ERC-1271 magic value, so the swapper accepts the signature.
 * - `rejected`: any other non-empty reply. ethers v5 hands back a revert's data as the call's
 *   result, so a revert that carries data is reported here too.
 * - `reverted`: the node reported a revert without data.
 * - `empty`: the call returned nothing, as a contract without isValidSignature does when its
 *   fallback returns (an EIP-7702 delegate, say); Permit2 cannot decode that and reverts without
 *   data. Also a revert the node reported with revert data `0x`.
 * - `not_checked`: not asked (the swapper has no code), or the RPC failed to answer.
 */
export type Erc1271ProbeResult = 'magic' | 'rejected' | 'reverted' | 'empty' | 'not_checked'

export type SwapperSignatureProbeResult = {
  // Unset when eth_getCode was not answered.
  swapperHasCode?: boolean
  // The delegated-to address when the swapper's code is an EIP-7702 delegation designator.
  delegate?: string
  erc1271Result: Erc1271ProbeResult
}

export type ProbedOrder = DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder | CosignedV3DutchOrder

// Asks a swapper with code whether it accepts an order's signature, the way Permit2's
// SignatureVerification does onchain.
export interface SwapperSignatureProbe {
  probe(chainId: number, order: ProbedOrder, signature: string): Promise<SwapperSignatureProbeResult>
}

// Answers that mean the swapper refuses the signature, which Permit2 turns into a revert.
export function isSignatureRejection(result: Erc1271ProbeResult): boolean {
  return result === 'rejected' || result === 'reverted' || result === 'empty'
}

// EIP-7702: an EOA's code is 0xef0100 followed by the 20-byte address it delegates to.
const EIP7702_DESIGNATOR_PREFIX = '0xef0100'
const EIP7702_DESIGNATOR_PREFIX_BYTES = 3
const EIP7702_DESIGNATOR_BYTES = EIP7702_DESIGNATOR_PREFIX_BYTES + 20

function eip7702Delegate(code: string): string | undefined {
  if (
    ethers.utils.hexDataLength(code) !== EIP7702_DESIGNATOR_BYTES ||
    !code.toLowerCase().startsWith(EIP7702_DESIGNATOR_PREFIX)
  ) {
    return undefined
  }
  return ethers.utils.getAddress(ethers.utils.hexDataSlice(code, EIP7702_DESIGNATOR_PREFIX_BYTES))
}

/**
 * The probe over the post path's RPC providers, bounded by one deadline for both calls. An RPC
 * that fails or runs out the deadline yields `not_checked`, never a rejection: it says nothing
 * about the signature.
 */
export class RpcSwapperSignatureProbe implements SwapperSignatureProbe {
  constructor(
    private readonly providerMap: ProviderMap,
    private readonly timeoutMs: number = SWAPPER_SIGNATURE_PROBE_TIMEOUT_MS
  ) {}

  async probe(chainId: number, order: ProbedOrder, signature: string): Promise<SwapperSignatureProbeResult> {
    let timer: NodeJS.Timeout | undefined
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('swapper signature probe timed out')), this.timeoutMs)
    })
    // ethers v5 calls cannot be aborted: a call that loses the race runs on to the provider's own timeout.
    const withinDeadline = <T>(work: Promise<T>): Promise<T> => Promise.race([work, expired])
    const swapper = order.info.swapper
    try {
      let provider: StaticJsonRpcProvider
      let code: string
      try {
        provider = this.providerMap.get(chainId)
        code = await withinDeadline(provider.getCode(swapper))
      } catch {
        return { erc1271Result: 'not_checked' }
      }
      if (code === '0x') {
        return { swapperHasCode: false, erc1271Result: 'not_checked' }
      }

      let erc1271Result: Erc1271ProbeResult
      // Everything that can throw stays in here, so the probe itself never fails the post.
      try {
        const { domain, types, values } = order.permitData()
        const digest = ethers.utils._TypedDataEncoder.hash(domain, types, values)
        const result = await withinDeadline(
          provider.call({
            // Permit2 is the caller onchain, and a wallet may answer according to its caller.
            from: domain.verifyingContract,
            to: swapper,
            data: ERC1271_INTERFACE.encodeFunctionData('isValidSignature', [digest, signature]),
          })
        )
        erc1271Result = result === '0x' ? 'empty' : isErc1271MagicValue(result) ? 'magic' : 'rejected'
      } catch (err) {
        erc1271Result = isRevertWithoutData(err) ? 'reverted' : 'not_checked'
      }
      return { swapperHasCode: true, delegate: eip7702Delegate(code), erc1271Result }
    } finally {
      clearTimeout(timer)
    }
  }
}

// How deep to follow an error's `error` causes; ethers nests two or three.
const MAX_CAUSE_DEPTH = 5

/**
 * ethers v5 throws CALL_EXCEPTION from eth_call whenever it finds no revert data, which covers
 * transport failures too: a timeout, a network error or a JSON-RPC error such as a rate limit is
 * wrapped as its `error` cause. Only a cause the node itself sent as a JSON-RPC error (numeric
 * code) saying the call reverted makes it a revert.
 */
function isRevertWithoutData(err: unknown): boolean {
  if (field(err, 'code') !== ethers.errors.CALL_EXCEPTION) {
    return false
  }
  let cause = field(err, 'error')
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cause !== undefined; depth++) {
    const message = field(cause, 'message')
    if (typeof field(cause, 'code') === 'number' && typeof message === 'string' && /revert/i.test(message)) {
      return true
    }
    cause = field(cause, 'error')
  }
  return false
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}
