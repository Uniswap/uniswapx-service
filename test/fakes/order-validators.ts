import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { OrderValidation, OrderValidator, SignedUniswapXOrder } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../../lib/util/chain'
import { OffChainUniswapXOrderValidator } from '../../lib/util/OffChainUniswapXOrderValidator'
import { OrderValidationResponse } from '../../lib/util/OrderValidationResponse'

type OffChainValidatedOrder = Parameters<OffChainUniswapXOrderValidator['validate']>[0]

// Off-chain field checks, answering `result` for every order.
export class FakeOffChainValidator extends OffChainUniswapXOrderValidator {
  public readonly calls: OffChainValidatedOrder[] = []
  public result: OrderValidationResponse = { valid: true }

  constructor() {
    super(() => 0)
  }

  override validate(order: OffChainValidatedOrder): OrderValidationResponse {
    this.calls.push(order)
    return this.result
  }
}

// Never dialled: the SDK quoter needs a provider to construct, and validate() is overridden.
const UNREACHABLE_RPC_URL = 'http://127.0.0.1:1'

// The order quoter's onchain simulation, answering `result` for every order on every chain.
export class FakeOnChainValidator extends OrderValidator {
  public readonly calls: SignedUniswapXOrder[] = []
  public result: OrderValidation = OrderValidation.OK

  constructor() {
    super(new StaticJsonRpcProvider(UNREACHABLE_RPC_URL, ChainId.MAINNET), ChainId.MAINNET)
  }

  override async validate(order: SignedUniswapXOrder): Promise<OrderValidation> {
    this.calls.push(order)
    return this.result
  }
}
