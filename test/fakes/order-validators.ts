import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { OrderValidation, OrderValidator, SignedUniswapXOrder } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../../lib/util/chain'
import {
  OffChainOrderValidatorConfig,
  OffChainUniswapXOrderValidator,
} from '../../lib/util/OffChainUniswapXOrderValidator'
import { OrderValidationResponse } from '../../lib/util/OrderValidationResponse'

type OffChainValidatedOrder = Parameters<OffChainUniswapXOrderValidator['validate']>[0]

// Off-chain field checks, answering `result` for every order; given a config, the real checks.
export class FakeOffChainValidator extends OffChainUniswapXOrderValidator {
  public readonly calls: OffChainValidatedOrder[] = []
  public result: OrderValidationResponse = { valid: true }

  // Without a config the real checks never run, so the placeholder one is never read.
  constructor(private readonly config?: OffChainOrderValidatorConfig) {
    super(config ?? { getCurrentTime: () => 0, deadlineValidityPeriodSeconds: 0, cosigner: '', priorityCosigner: '' })
  }

  override validate(order: OffChainValidatedOrder): OrderValidationResponse {
    this.calls.push(order)
    return this.config ? super.validate(order) : this.result
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
