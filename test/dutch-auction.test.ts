import { log } from "console";
import { ethers, BigNumber, Wallet } from "ethers";
import { splitSignature } from "ethers/lib/utils";
import { NonceManager, DutchLimitOrderBuilder, parseOrder, DutchLimitOrder, ResolvedOrder, SignedOrder, TokenAmount } from "gouda-sdk";
import { DutchLimitOrderReactor__factory } from "gouda-sdk/dist/src/contracts";
import { OrderEntity } from "../../lib/entities";
import { CurrencyAmount, Token, TradeType } from "@uniswap/sdk-core";
import { Protocol } from "@uniswap/router-sdk";
import {
  AlphaRouter,
  CachingGasStationProvider,
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  EIP1559GasPriceProvider,
  GasPrice,
  LegacyGasPriceProvider,
  NodeJSCache,
  OnChainGasPriceProvider,
  SwapRoute,
  TokenProvider,
  UniswapMulticallProvider,
} from "@uniswap/smart-order-router";
import { encodeRouteToPath, Route } from "@uniswap/v3-sdk";
import { ChainId } from "../../lib/util/chain";
import NodeCache from "node-cache";

// Mainnet tenderly fork that gouda contracts are deployed to
const MAINNET_TENDERLY = process.env.TENDERLY_1
const postRequestBodyMock = {
  encodedOrder: '',
  signature: '',
  chainId: 1
}

// not deployed to tenderly, this is from gouda-bot deployment on mainnet
const goudaBotExecutorAddress = '0xA4855071f01822361A5b19C5756230ec6510cb51'

const executeOrders = async (executions: OrderExecution[], provider: ethers.providers.JsonRpcProvider): Promise<void> => {
    for (const execution of executions) {
      const reactor = DutchLimitOrderReactor__factory.connect(
        execution.reactor,
        provider
      );

      console.log(`Executing ${execution.orders.length} orders`);
      console.log(
        `Using ${execution.fillContract} with args: ${execution.fillData}`
      );
      const tx = await reactor.connect(provider).executeBatch(
        execution.orders.map((order) => {
          const { v, r, s } = splitSignature(order.signature);
          return {
            order: order.order.serialize(),
            sig: { v, r, s },
          };
        }),
        execution.fillContract,
        execution.fillData,
        {
          // TODO: calculate gas limit better
          // auto-calculated runs out of gas sometimes
          gasLimit: 400000,

        }
      );

      console.log(`Execution pending in tx: ${tx.hash}`);
    }
  }

describe('Dutch Order Lifecycle', () => {
  beforeAll(async () => {
    const chainId = ChainId.MAINNET
    const provider = new ethers.providers.JsonRpcProvider(MAINNET_TENDERLY);
    const multicallProvider = new UniswapMulticallProvider(chainId, provider);
    const gasPriceCache = new NodeJSCache<GasPrice>(
        new NodeCache({ stdTTL: 15, useClones: true })
    );
    const router = new AlphaRouter({
        provider,
        chainId: chainId,
        multicall2Provider: multicallProvider,
        gasPriceProvider: new CachingGasStationProvider(
          chainId,
          new OnChainGasPriceProvider(
            chainId,
            new EIP1559GasPriceProvider(provider),
            new LegacyGasPriceProvider(provider)
          ),
          gasPriceCache
        ),
    });
    const signer = await provider.getSigner('Raghava')
    const account = await signer.getAddress();
    const nonceMgr = new NonceManager(provider, 1);
    const nonce = await nonceMgr.useNonce(account);

    // deadline is 5 minutes from now
    const deadline = 5*60+(new Date().getTime())/1000

    const builder = new DutchLimitOrderBuilder(chainId);
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(nonce)
      .input({
        token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        amount: BigNumber.from('1000000'),
      })
      .output({
        token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        startAmount: BigNumber.from('1000000000000000000'),
        endAmount: BigNumber.from('900000000000000000'),
        recipient: '0x0000000000000000000000000000000000000000',
      })
      .build();
    
    // Sign the built order 
    const { domain, types, values } = order.permitData();
    const signature = signer._signTypedData(domain, types, values);

    const serializedOrder = order.serialize();
  })
  it('POST endpoint adds new orders to the database', () => {
    //todo
  })
  it('GET endpoint returns orders, which are then filled on chain', () => {
    //todo
    const response = axios.get
  })
})


export interface QuotedOrder extends SignedOrder {
  quote: ResolvedOrder
}

export interface OrderExecution {
  orders: SignedOrder[];
  reactor: string;
  fillContract: string;
  fillData: string;
  // in terms of the output token for now, should normalize to ETH or USDC or something in the future
  expectedProfit: BigNumber;
}

// Finds the best route for executing the given swaps
// returns instructions for filling them through gouda
// note this returns even unprofitable orders
const routeOrders = async (orders: QuotedOrder[], router: AlphaRouter, tokenProvider: TokenProvider): Promise<OrderExecution[]> => {
  const tokenAddresses = orders.reduce(
    (acc: Set<string>, order: QuotedOrder) => {
    acc.add(order.quote.input.token);
    order.quote.outputs.forEach((output) => acc.add(output.token));
    return acc;
    },
    new Set()
  );
  const { getTokenByAddress } = await tokenProvider.getTokens(
    Array.from(tokenAddresses)
  );

  // TODO: handle order batching
  const routes = await Promise.all(
    orders.map(async (order) => {
    const { input, outputs } = order.quote;
    const inputToken = getTokenByAddress(input.token);
    // TODO: handle outputs with different token types
    const outputToken = getTokenByAddress(outputs[0].token);
    if (!inputToken || !outputToken) {
      return undefined;
    }
    const amount = CurrencyAmount.fromRawAmount(
      inputToken,
      input.amount.toString()
    );
    try {
      return await router.route(
      amount,
      outputToken,
      TradeType.EXACT_INPUT,
      undefined,
      {
        // for now only v3
        // in the future use swaprouter02 to get v2/v3 optionality
        protocols: [Protocol.V3],
      }
      );
    } catch (e) {
      console.log(
      `Error getting route: ${e}, for order: ${order.order.hash()}`
      );
      console.error(e);
      console.dir(order.order, { depth: 6 });
      return undefined;
    }
    })
  );

  return routes.reduce(
    (
      acc: OrderExecution[],
      route: SwapRoute | null | undefined,
      i: number
    ) => {
        if (!route) {
          return acc;
        }

        const order = orders[i];
        // gas cost included in the quote
        const outputQuote = BigNumber.from(
          route.quoteGasAdjusted.quotient.toString()
        );
        const outputRequired = order.quote.outputs.reduce(
          (acc: BigNumber, output: TokenAmount) => {
            acc = acc.add(output.amount);
            return acc;
          },
          BigNumber.from(0)
        );
        const profit = outputQuote.sub(outputRequired);

        console.log(
          `Expected profit: ${profit.toString()} ${route.quote.currency.symbol}`
        );
        const encodedRoute = encodeRouteToPath(
          route.route[0].route as Route<Token, Token>,
          false
        );
        acc.push({
          orders: [order],
          reactor: order.order.info.reactor,
          fillContract: goudaBotExecutorAddress,
          fillData: encodedRoute,
          expectedProfit: profit,
        });
        return acc;
    },
    []
  );
}
