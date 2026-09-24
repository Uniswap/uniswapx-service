/* eslint-disable jest/no-disabled-tests */
import { DutchOrder, DutchOrderBuilder, REACTOR_ADDRESS_MAPPING, SignedUniswapXOrder, UnsignedV2DutchOrder, V2DutchOrderBuilder } from '@uniswap/uniswapx-sdk'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { MAX_UINT96, PERMIT2, UNI, WETH, ZERO_ADDRESS } from './constants'
import { v4 as uuidv4 } from 'uuid'

import { UniswapXOrderEntity } from '../../lib/entities'
import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema/GetOrdersResponse'
import { ChainId } from '../../lib/util/chain'
import * as ERC20_ABI from './abis/erc20.json'
import { stringValue } from 'aws-sdk/clients/iot'
import { ExclusiveDutchOrderReactor__factory } from '@uniswap/uniswapx-sdk/dist/cjs/src/contracts/factories'
import { RPC_HEADERS } from '../../lib/util/constants'
const { abi } = ERC20_ABI

dotenv.config()

type OrderExecution = {
  orders: SignedUniswapXOrder[]
  reactor: string
  fillContract: string
  fillData: string
}

// if the CLI argument runInBand is not provided, throw
if (!process.argv.includes('--runInBand')) {
  throw new Error('Integration tests must be run with --runInBand flag')
}

/// @dev These tests run against MAINNET (testChainId below) and are gasless by
/// design: orders are posted with a dust-sized, funded input (so the tracker's
/// on-chain quote passes) and an absurdly large output (so no filler will ever
/// take them), then tracked to expiry. CI never sends a transaction.
///
/// Wallet preconditions, asserted read-only in beforeAll:
///   alice (TEST_WALLET_PK, 0xE001E6F6879c07b9Ac24291A490F2795106D348C):
///     UNI balance >= DUST_INPUT_AMOUNT and a standing UNI->Permit2 max
///     allowance (set once, tx nonce 1 on mainnet). If either regresses,
///     beforeAll fails with instructions rather than sending a tx from CI.
///   filler (TEST_FILLER_PK, 0x8943EA25bBfe135450315ab8678f2F79559F4630):
///     only needed by the still-skipped fill block; currently unfunded on
///     mainnet (0 ETH) — see that block's comment for what reviving it takes.
// const MIN_WETH_BALANCE = ethers.utils.parseEther('0.05')
// const MIN_UNI_BALANCE = ethers.utils.parseEther('0.05')

// Lifecycle tests post real (dust, unfillable) orders and track them to
// expiry. Only the beta pipeline gate sets RUN_LIFECYCLE_TESTS=true — see
// addIntegTests in bin/app.ts for why prod does not.
const describeLifecycle = process.env.RUN_LIFECYCLE_TESTS === 'true' ? describe : describe.skip
const itLifecycle = process.env.RUN_LIFECYCLE_TESTS === 'true' ? it : it.skip

describe('/dutch-auction/order', () => {
  const DEFAULT_DEADLINE_SECONDS = 48
  jest.setTimeout(240 * 1000)
  jest.retryTimes(2)
  let alice: Wallet
  let filler: Wallet
  let provider: ethers.providers.StaticJsonRpcProvider
  let aliceAddress: string
  let nonce: BigNumber
  let URL: string
  let QUOTE_URL: string
  let PARAM_URL: string
  let COSIGNER_ADDRESS: string
  let QUOTE_API_KEY: string | undefined
  const testChainId: number = ChainId.MAINNET
  // Token contracts
  const wethAddress = WETH
  const uniAddress = UNI
  let uni: Contract

  // trade amount for every test
  const amount = BigNumber.from("5000000000000000000000")
  // Use this amount for the actual order to not trigger a fill
  const replacementAmount = BigNumber.from("500")
  // Lifecycle (expiry) tests post orders that must be FUNDED but UNFILLABLE:
  // - input: dust the test wallet actually holds, so the status tracker's
  //   on-chain quote succeeds and the order verifies to 'open' (an input the
  //   wallet cannot cover resolves to 'insufficient-funds', not 'expired').
  // - output: absurdly large, so filling is never economical for anyone.
  const DUST_INPUT_AMOUNT = BigNumber.from("500")
  const UNFILLABLE_OUTPUT_AMOUNT = ethers.utils.parseEther("100000")

  beforeAll(async () => {
    if (!process.env.UNISWAPX_SERVICE_URL) {
      throw new Error('UNISWAPX_SERVICE_URL not set')
    }
    if (!process.env.TAPI_QUOTE_URL) {
      throw new Error('TAPI_QUOTE_URL not set')
    }
    if (!process.env.TAPI_API_KEY) {
      throw new Error('TAPI_API_KEY not set')
    }
    if (!process.env.GPA_SERVICE_URL) {
      throw new Error('GPA_SERVICE_URL not set')
    }
    if (!process.env.RPC_PREFIX_URL) {
      throw new Error('RPC_PREFIX_URL not set')
    }
    if (!process.env.TEST_WALLET_PK) {
      throw new Error('TEST_WALLET_PK not set')
    }
    if (!process.env.TEST_FILLER_PK) {
      throw new Error('TEST_FILLER_PK not set')
    }
    if (!process.env.COSIGNER_ADDRESS) {
      throw new Error('COSIGNER_ADDRESS not set')
    }
    URL = process.env.UNISWAPX_SERVICE_URL
    QUOTE_URL = process.env.TAPI_QUOTE_URL
    PARAM_URL = process.env.GPA_SERVICE_URL
    COSIGNER_ADDRESS = process.env.COSIGNER_ADDRESS
    QUOTE_API_KEY = process.env.TAPI_API_KEY

    provider = new ethers.providers.StaticJsonRpcProvider({
      url: `${process.env.RPC_PREFIX_URL.replace(/\/$/, '')}/1`,
      headers: RPC_HEADERS
    })
    alice = new ethers.Wallet(process.env.TEST_WALLET_PK).connect(provider)
    filler = new ethers.Wallet(process.env.TEST_FILLER_PK).connect(provider)
    aliceAddress = (await alice.getAddress()).toLowerCase()

    uni = new Contract(uniAddress, abi, provider)

    // make sure filler wallet has enough ETH for gas
    // const fillerMinBalance = ethers.utils.parseEther('0.1')
    // if (!(await provider.getBalance(filler.address)).gte(fillerMinBalance)) {
    //   throw new Error('filler wallet does not has enough ETH for gas')
    // }
    // make sure both wallets have enough erc20 balance
    if (!((await uni.balanceOf(alice.address)) as BigNumber).gte(replacementAmount)) {
      throw new Error(`alice wallet ${alice.address} does not have enough UNI ${await uni.balanceOf(alice.address)}`)
    }

    // Read-only precondition check (throws with instructions; never sends a
    // tx from CI). Was previously an unawaited call, so any failure surfaced
    // as an unhandled rejection instead of a beforeAll error.
    await checkApprovals(uni, alice)

    // if (!((await weth.balanceOf(alice.address)) as BigNumber).gte(MIN_WETH_BALANCE)) {
    //   throw new Error('alice wallet does not have enough WETH')
    // }
    // if (!((await uni.balanceOf(filler.address)) as BigNumber).gte(MIN_UNI_BALANCE)) {
    //   throw new Error('filler wallet does not have enough UNI')
    // }
    // if (!((await weth.balanceOf(filler.address)) as BigNumber).gte(MIN_WETH_BALANCE)) {
    //   throw new Error('filler wallet does not have enough ETH')
    // }

    // const checkApprovals = async (wallets: Wallet[]) => {
    //   for (const wallet of wallets) {
    //     // check approvals on Permit2
    //     const wethAllowance = await weth.allowance(wallet.address, PERMIT2)
    //     const uniAllowance = await uni.allowance(wallet.address, PERMIT2)
    //     if (wethAllowance.lt(ethers.constants.MaxUint256.div(2))) {
    //       const receipt = await weth.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
    //       await receipt.wait()
    //     }
    //     if (uniAllowance.lt(ethers.constants.MaxUint256.div(2))) {
    //       const receipt = await uni.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
    //       await receipt.wait()
    //     }

    //     const reactorAddress = REACTOR_ADDRESS_MAPPING[testChainId]['Dutch']
    //     // check approvals on reactor
    //     const wethReactorAllowance = await weth.allowance(wallet.address, reactorAddress)
    //     const uniReactorAllowance = await uni.allowance(wallet.address, reactorAddress)
    //     if (wethReactorAllowance.lt(ethers.constants.MaxUint256.div(2))) {
    //       const receipt = await weth.connect(wallet).approve(reactorAddress, ethers.constants.MaxUint256)
    //       await receipt.wait()
    //     }
    //     if (uniReactorAllowance.lt(ethers.constants.MaxUint256.div(2))) {
    //       const receipt = await uni.connect(wallet).approve(reactorAddress, ethers.constants.MaxUint256)
    //       await receipt.wait()
    //     }
    //   }
    // }

    // await checkApprovals([alice, filler])

    const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(getResponse.status).toEqual(200)
    nonce = BigNumber.from(getResponse.data.nonce)
    expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()
  })

  beforeEach(() => {
    nonce = nonce.add(1)
  })

  async function expectOrdersToBeOpen(orderHashes: string[]) {
    // check that orders are open, retrying if status is unverified, with backoff
    for (let i = 0; i < 5; i++) {
      const promises = orderHashes.map((orderHash) =>
        axios.get<GetOrdersResponse<UniswapXOrderEntity>>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
      )
      const responses = await Promise.all(promises)
      expect(responses.every((resp) => resp.status === 200)).toBe(true)
      const orders = responses.map((resp) => resp.data.orders[0])
      expect(orders.length).toEqual(orderHashes.length)
      const orderStatuses = orders.map((order) => order!.orderStatus)
      if (orderStatuses.every((status) => status === 'open')) {
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** i * 1000))
    }
    return false
  }

  async function getOrderStatus(orderHash: string): Promise<string> {
    const resp = await axios.get<GetOrdersResponse<UniswapXOrderEntity>>(
      `${URL}dutch-auction/orders?orderHash=${orderHash}`
    )
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(1)
    const order = resp.data.orders[0]
    expect(order).toBeDefined()
    expect(order!.orderHash).toEqual(orderHash)
    return order!.orderStatus
  }

  const TERMINAL_STATUSES = ['expired', 'filled', 'cancelled', 'error', 'insufficient-funds']

  /**
   * Poll until the order reaches `expectedStatus` or any terminal status,
   * whichever comes first, then return what it reached.
   *
   * The predecessor slept a fixed interval and checked exactly once, which
   * raced the status-tracking step function's ~12s (jittered, backing-off)
   * cadence: landing between the deadline and the next SFN tick failed the
   * test with 'open' even though tracking was healthy. Polling makes the test
   * assert the outcome, not the scheduler's timing. Reaching a *different*
   * terminal status returns immediately so the assertion diff shows what
   * actually happened instead of burning the whole budget.
   */
  async function pollOrderStatusUntil(
    orderHash: string,
    expectedStatus: string,
    notBeforeMs: number,
    budgetMs: number,
    pollIntervalMs = 5000
  ): Promise<string> {
    if (notBeforeMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, notBeforeMs))
    }
    const startedAt = Date.now()
    let status = await getOrderStatus(orderHash)
    while (Date.now() - startedAt < budgetMs) {
      if (status === expectedStatus || TERMINAL_STATUSES.includes(status)) {
        return status
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      status = await getOrderStatus(orderHash)
    }
    return status
  }

  const buildOrder = async (
    swapper: string,
    amount: BigNumber,
    deadlineSeconds: number,
    inputToken: string,
    outputToken: string,
    outputAmount: BigNumber = amount
  ): Promise<{ order: DutchOrder; payload: { encodedOrder: string; signature: string; chainId: ChainId } }> => {
    const deadline = Math.round(new Date().getTime() / 1000) + deadlineSeconds
    const decayStartTime = Math.round(new Date().getTime() / 1000)
    const order = new DutchOrderBuilder(testChainId)
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(decayStartTime)
      .swapper(swapper)
      .exclusiveFiller(filler.address, BigNumber.from(100))
      .nonce(nonce)
      .input({
        token: inputToken,
        // limit orders have all start amounts = all endamounts: e.g.
        // input.startAmount==input.endAmount && all(outputs[i].startAmount==outputs[i].endAmount)
        // and this test is for dutch orders
        startAmount: amount.sub(1),
        endAmount: amount,
      })
      .output({
        token: outputToken,
        startAmount: outputAmount,
        endAmount: outputAmount,
        recipient: swapper,
      })
      .build()

    const { domain, types, values } = order.permitData()
    const signature = await alice._signTypedData(domain, types, values)
    const encodedOrder = order.serialize()

    return {
      order,
      payload: { encodedOrder: encodedOrder, signature: signature, chainId: testChainId },
    }
  }

  const getDutchv2OrderFromQuoteAPI = async (
    swapper: string,
    amount: BigNumber,
    inputToken: string,
    outputToken: string
  ): Promise<{ order: UnsignedV2DutchOrder, quoteId: string; encodedOrder: string; signature: string; chainId: ChainId }> => {
    const routingType = 'DUTCH_V2'
    const exactInQuoteReq = {
      swapper,
      tokenInChainId: testChainId,
      tokenIn: inputToken,
      tokenOutChainId: testChainId,
      tokenOut: outputToken,
      amount: amount.toString(),
      type: 'EXACT_INPUT',
      routingPreference: 'BEST_PRICE',
      autoSlippage: 'DEFAULT',
    }
      try {
        const quoteResponse = await axios.post<any>(QUOTE_URL, exactInQuoteReq, {
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
            ...(QUOTE_API_KEY && { 'x-api-key': QUOTE_API_KEY }),
          },
        })
        const { data, status } = quoteResponse
        expect(status).toEqual(200)
        const { routing, quote } = data
        expect(routing).toBe(routingType)

        // const tokenIn = quote.orderInfo.input
        const tokenOut = quote.orderInfo.outputs[0]
        const prebuildOrder = new V2DutchOrderBuilder(testChainId)
        .input({
          token: inputToken,
          startAmount: replacementAmount,
          endAmount: replacementAmount,
        })
        .output({
          token: tokenOut.token,
          startAmount: BigNumber.from(tokenOut.startAmount),
          endAmount: BigNumber.from(tokenOut.endAmount),
          recipient: swapper,
        })
        .nonce(nonce)
        .cosigner(COSIGNER_ADDRESS)
        .deadline(quote.orderInfo.deadline)
        .swapper(swapper)

        const order: UnsignedV2DutchOrder = prebuildOrder.buildPartial()
        // return order
        const { domain, types, values } = order.permitData()
        const signature = await alice._signTypedData(domain, types, values)
        const encodedOrder = order.serialize()
    
        return { order, quoteId: quote.quoteId, encodedOrder: encodedOrder, signature: signature, chainId: testChainId }
      } catch (err: any) {
        console.log('quote api error response', err.response?.data)
        console.log(err.message)
        throw err
      }

  }

  const submitOrder = async (
    payload: {
      encodedOrder: string
      signature: string
      chainId: ChainId,
      orderType?: string,
      quoteId?: string,
      requestId?: stringValue
    }
  ): Promise<void> => {
    try {
      const postResponse = await axios({
        method: 'post',
        url: `${URL}dutch-auction/order`,
        data: payload,
      })
      expect(postResponse.status).toEqual(201)
    } catch (err: any) {
      console.log(err.message)
      throw err
    }
  }

  const submitV2Order = async (
    payload: {
      quoteId: string,
      encodedOrder: string
      signature: string
      chainId: ChainId
    }
  ): Promise<void> => {
    const quoteReq = {
      quoteId: payload.quoteId,
      requestId: uuidv4(),
      encodedInnerOrder: payload.encodedOrder,
      innerSig: payload.signature,
      tokenInChainId: testChainId,
      tokenOutChainId: testChainId,
      allowNoQuote: false,
      forceOpenOrder: true
    }

    let response
    try {
      response = await axios({
        method: 'post',
        url: `${PARAM_URL!}/hard-quote`,
        data: quoteReq,
      })
    } catch (err: any) {
      const status = err.response?.status
      throw new Error(`Order submission failed with ${status} and data ${JSON.stringify(err.response?.data)}`)
    }
    expect(response.status).toEqual(200)
    expect(response.data.orderHash).toBeDefined()
  }

  const buildAndSubmitOrder = async (
    swapper: string,
    amount: BigNumber,
    deadlineSeconds: number,
    inputToken: string,
    outputToken: string,
    outputAmount: BigNumber = amount
  ): Promise<{
    order: DutchOrder
    signature: string
  }> => {
    const { order, payload } = await buildOrder(swapper, amount, deadlineSeconds, inputToken, outputToken, outputAmount)

    await submitOrder(payload)
    return { order, signature: payload.signature }
  }

  const fillOrder = async (order: DutchOrder, signature: string) => {
    const execution: OrderExecution = {
      orders: [
        {
          order,
          signature,
        },
      ],
      reactor: REACTOR_ADDRESS_MAPPING[testChainId]['Dutch']!,
      // direct fill is 0x01
      fillContract: '0x0000000000000000000000000000000000000001',
      fillData: '0x',
    }

    // if output token is ETH, then the value is the amount of ETH to send
    const value = order.info.outputs[0].token == ZERO_ADDRESS ? order.info.outputs[0].startAmount : 0

    const reactor = ExclusiveDutchOrderReactor__factory.connect(execution.reactor, provider)
    const fillerNonce = await filler.getTransactionCount()
    const maxFeePerGas = (await provider.getFeeData()).maxFeePerGas?.add(10000)
    const maxPriorityFeePerGas = maxFeePerGas || ethers.utils.parseUnits('1', 'gwei')

    const populatedTx = await reactor.populateTransaction.executeBatch(
      execution.orders.map((order) => {
        return {
          order: order.order.serialize(),
          sig: order.signature,
        }
      }),
      {
        gasLimit: BigNumber.from(700_000),
        nonce: fillerNonce,
        ...(maxFeePerGas && { maxFeePerGas }),
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        value,
      }
    )

    populatedTx.gasLimit = BigNumber.from(700_000)

    const tx = await filler.sendTransaction(populatedTx)
    const receipt = await tx.wait()

    return receipt.transactionHash
  }

  // Assert the standing Permit2 allowance is in place. Deliberately read-only:
  // auto-approving from CI is what caused the old "timeouts in beforeAll" on
  // gas spikes, and a mainnet tx should be a human action, not a test side
  // effect. The allowance is set once per wallet and never consumed down —
  // permit2 transfers spend signature allowances, not this ERC20 allowance.
  async function checkApprovals(tokenContract: Contract, wallet: Wallet) {
    const allowance = await tokenContract.allowance(wallet.address, PERMIT2)
    if (allowance.lt(MAX_UINT96)) {
      throw new Error(
        `wallet ${wallet.address} has no standing Permit2 allowance for ` +
          `${tokenContract.address} (found ${allowance.toString()}). Approve it ` +
          `once manually: token.approve(${PERMIT2}, MaxUint256) from that wallet.`
      )
    }
  }

  describe('order endpoint sanity checks', () => {
    
    /**
     * Skipped: depends on three live services agreeing (trading-api quote ->
     * this service -> parameterization-api /hard-quote with forceOpenOrder),
     * plus COSIGNER_ADDRESS matching GPA's actual cosigner. It was disabled in
     * #649 without a recorded reason — almost certainly pipeline flakiness in
     * that chain of dependencies. Revive deliberately, with its own
     * budget/polling treatment, not as a side effect of another change.
     */
    it.skip('2xx with an order from quote API', async () => {
      const unsignedOrderResult = await getDutchv2OrderFromQuoteAPI(
        aliceAddress,
        amount,
        uniAddress,
        wethAddress
      )
      await submitV2Order({...unsignedOrderResult})
    })

    itLifecycle('2xx', async () => {
      // Dust-funded UNI input so the order verifies to open rather than
      // resolving to insufficient-funds when the tracker quotes it on-chain.
      await buildAndSubmitOrder(
        aliceAddress,
        DUST_INPUT_AMOUNT,
        DEFAULT_DEADLINE_SECONDS,
        uniAddress,
        wethAddress,
        UNFILLABLE_OUTPUT_AMOUNT
      )
    })

    it('4xx', async () => {
      const { payload } = await buildOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        wethAddress,
        uniAddress
      )
      await expect(submitOrder({ ...payload, chainId: 'xyz' } as any)).rejects.toMatchObject({
        response: {
          status: 400,
        },
      })
    })
  })

  // Pure HTTP query-param coverage; no chain or wallet dependency.
  describe('orders endpoint sanity checks', () => {
    it.each([
      [{ orderStatus: 'open' }, 200],
      [{ chainId: 1 }, 200],
      [{ orderStatus: 'expired' }, 200],
      [{ swapper: '0x0000000000000000000000000000000000000000' }, 200],
      [{ filler: '0x0000000000000000000000000000000000000000' }, 200],
      // GET /orders is a single page of the newest orders: default-valued sort params are accepted,
      // anything else (or a cursor) is a 400.
      [{ orderStatus: 'expired', sortKey: 'createdAt', chainId: 137 }, 200],
      [{ orderStatus: 'expired', sortKey: 'createdAt', desc: true }, 200],
      [{ orderStatus: 'expired', sortKey: 'createdAt', desc: false }, 400],
      [{ orderStatus: 'expired', sortKey: 'createdAt', sort: 'gt(1675881506)' }, 400],
      [{ orderStatus: 'expired', cursor: 'eyJvcmRlckhhc2giOiIweGRlYWRiZWVmNTcxNDAzIn0=' }, 400],
      [{ orderStatus: 'expired', swapper: '0x0000000000000000000000000000000000000000' }, 200],
      [{ orderStatus: 'expired', filler: '0x0000000000000000000000000000000000000000' }, 200],
      [{ orderHash: '0x0000000000000000000000000000000000000000000000000000000000000000' }, 200],
      [
        {
          orderHashes:
            '0x0000000000000000000000000000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000000000000000000000000000',
        },
        200,
      ],
      [{ x: '0x0000000000000000000000000000000000000000000000000000000000000000' }, 400],
    ])(
      'Fetches orders with the following query param %p',
      async (queryFilters: { [key: string]: string | boolean | number }, status: number) => {
        const params = Object.keys(queryFilters)
        const queryParams = params.reduce((acc, key) => {
          const value = `${acc}${key}=${queryFilters[key]}`
          return key == params[params.length - 1] ? value : value + '&'
        }, '')

        if (status == 200) {
          const resp = await axios.get<GetOrdersResponse<UniswapXOrderEntity>>(
            `${URL}dutch-auction/orders?${queryParams}`
          )
          expect(resp.status).toEqual(200)
        } else {
          await expect(
            axios.get<GetOrdersResponse<UniswapXOrderEntity>>(`${URL}dutch-auction/orders?${queryParams}`)
          ).rejects.toMatchObject({
            response: {
              status,
            },
          })
        }
      }
    )
  })

  // End-to-end lifecycle coverage: posted -> open -> (SFN tracks) -> expired.
  // This is the only e2e coverage of the status-tracking step function; if
  // trackers stop starting, these are the tests that catch it post-deploy.
  //
  // Orders use a dust UNI input (alice holds it; tracker's on-chain quote
  // passes) and an unfillable output (nobody will take dust-for-100k). The
  // input token must be UNI on mainnet: it is the only token the test wallet
  // holds and has a standing Permit2 allowance for.
  describeLifecycle('checking expiry', () => {
    // The SFN re-checks on a ~12s jittered cadence and statuses land a tick
    // or two after the deadline; 90s of budget past the deadline keeps this
    // deterministic without letting a genuine failure run long. The reaper
    // backstop resolves in tens of minutes, so a pass inside this budget is
    // evidence the SFN path specifically is alive.
    const EXPIRY_BUDGET_MS = 90 * 1000

    it('erc20 to erc20', async () => {
      const { order } = await buildAndSubmitOrder(
        aliceAddress,
        DUST_INPUT_AMOUNT,
        DEFAULT_DEADLINE_SECONDS,
        uniAddress,
        wethAddress,
        UNFILLABLE_OUTPUT_AMOUNT
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(
        await pollOrderStatusUntil(order.hash(), 'expired', DEFAULT_DEADLINE_SECONDS * 1000, EXPIRY_BUDGET_MS)
      ).toBe('expired')
    })

    it('erc20 to eth', async () => {
      const { order } = await buildAndSubmitOrder(
        aliceAddress,
        DUST_INPUT_AMOUNT,
        DEFAULT_DEADLINE_SECONDS,
        uniAddress,
        ZERO_ADDRESS,
        UNFILLABLE_OUTPUT_AMOUNT
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(
        await pollOrderStatusUntil(order.hash(), 'expired', DEFAULT_DEADLINE_SECONDS * 1000, EXPIRY_BUDGET_MS)
      ).toBe('expired')
    })

    it('does not expire order before deadline', async () => {
      const { order } = await buildAndSubmitOrder(
        aliceAddress,
        DUST_INPUT_AMOUNT,
        DEFAULT_DEADLINE_SECONDS,
        uniAddress,
        ZERO_ADDRESS,
        UNFILLABLE_OUTPUT_AMOUNT
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      // Negative check: well before the 48s deadline the order must still be
      // open. A single read 15s in is deterministic — expiry cannot have
      // legitimately happened yet, so any terminal status here is a bug.
      await new Promise((resolve) => setTimeout(resolve, 15 * 1000))
      expect(await getOrderStatus(order.hash())).toBe('open')
    })
  })

  // Skipped: filling requires the filler wallet to spend real funds, and it
  // has none on mainnet (0x8943EA25bBfe135450315ab8678f2F79559F4630: 0 ETH,
  // 0 UNI as of 2026-08). Reviving this is an ops decision, not a code fix:
  //   1. fund filler with ETH for gas and enough output-token balance
  //   2. give filler a standing Permit2/reactor allowance for the output token
  //   3. budget for real gas spend on every pipeline run, or repoint the suite
  //      at a cheap chain the service tracks (requires reactor + tokens there)
  // Until then, fill coverage lives in the unit/integ suites against Anvil.
  describe.skip('+ attempt to fill', () => {
    it('erc20 to eth', async () => {
      const { order, signature } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        uniAddress,
        ZERO_ADDRESS
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      const txHash = await fillOrder(order, signature)
      expect(txHash).toBeDefined()
      expect(await pollOrderStatusUntil(order.hash(), 'filled', 0, 60 * 1000)).toBe('filled')
    })

    it('erc20 to erc20', async () => {
      const { order, signature } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        wethAddress,
        uniAddress
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      const txHash = await fillOrder(order, signature)
      expect(txHash).toBeDefined()
      expect(await pollOrderStatusUntil(order.hash(), 'filled', 0, 60 * 1000)).toBe('filled')
    })

    describe('checking cancel', () => {
      it('updates status to cancelled when fill reverts due to nonce reuse', async () => {
        const { order: order1, signature: sig1 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          wethAddress,
          uniAddress
        )
        const { order: order2, signature: sig2 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          uniAddress,
          ZERO_ADDRESS
        )
        expect(order1.info.nonce.toString()).toEqual(order2.info.nonce.toString())
        expect(await expectOrdersToBeOpen([order1.hash(), order2.hash()])).toBeTruthy()
        // fill the first one
        const txHash = await fillOrder(order1, sig1)
        expect(txHash).toBeDefined()
        expect(await pollOrderStatusUntil(order1.hash(), 'filled', 0, 60 * 1000)).toBe('filled')
        // try to fill the second one, expect revert
        try {
          await fillOrder(order2, sig2)
          expect(true).toBeFalsy()
        } catch (err: any) {
          expect(err.message.includes('transaction failed')).toBeTruthy()
        }
        expect(await pollOrderStatusUntil(order2.hash(), 'cancelled', 0, 60 * 1000)).toBe('cancelled')
      })

      xit('allows same swapper to post multiple orders with different nonces and be filled', async () => {
        const { order: order1, signature: sig1 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          wethAddress,
          uniAddress
        )
        nonce = nonce.add(1)
        const { order: order2, signature: sig2 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          uniAddress,
          ZERO_ADDRESS
        )
        expect(order2.info.nonce).toEqual(order1.info.nonce.add(1))
        expect(await expectOrdersToBeOpen([order1.hash(), order2.hash()])).toBeTruthy()
        const txHash = await fillOrder(order1, sig1)
        expect(txHash).toBeDefined()
        const txHash2 = await fillOrder(order2, sig2)
        expect(txHash2).toBeDefined()
        expect(await pollOrderStatusUntil(order1.hash(), 'filled', 0, 60 * 1000)).toBe('filled')
        expect(await pollOrderStatusUntil(order2.hash(), 'filled', 0, 60 * 1000)).toBe('filled')
      })
    })
  })
})
