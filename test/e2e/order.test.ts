import { DutchOrder, DutchOrderBuilder, REACTOR_ADDRESS_MAPPING, SignedUniswapXOrder } from '@uniswap/uniswapx-sdk'
import { factories } from '@uniswap/uniswapx-sdk/dist/src/contracts/index'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { UNI_GOERLI, WETH_GOERLI, ZERO_ADDRESS } from './constants'

const { ExclusiveDutchOrderReactor__factory } = factories

import { AVERAGE_BLOCK_TIME } from '../../lib/handlers/check-order-status/util'
import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema'
import { ChainId } from '../../lib/util/chain'
import * as ERC20_ABI from './abis/erc20.json'
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

/// @dev these integration tests require two wallets with enough ETH and erc20 balance to fill orders
/// if tests are failing in the beforeAll hook, it's likely because their balances have fallen
/// below the minimum balances below
/// Addresses on goerli:
///   alice address: 0xE001E6F6879c07b9Ac24291A490F2795106D348C
///   filler address: 0x8943EA25bBfe135450315ab8678f2F79559F4630 (also needs to have at least 0.1 ETH)
// constants
// Another potential problem can arise if the priority fee on GOERLI moves higher causing timeouts in beforeAll
const MIN_WETH_BALANCE = ethers.utils.parseEther('0.05')
const MIN_UNI_BALANCE = ethers.utils.parseEther('0.05')

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
  // Token contracts
  let weth: Contract
  let uni: Contract

  // trade amount for every test
  const amount = ethers.utils.parseEther('0.01')

  beforeAll(async () => {
    if (!process.env.UNISWAPX_SERVICE_URL) {
      throw new Error('UNISWAPX_SERVICE_URL not set')
    }
    if (!process.env.RPC_5) {
      throw new Error('RPC_5 not set')
    }
    if (!process.env.TEST_WALLET_PK) {
      throw new Error('TEST_WALLET_PK not set')
    }
    if (!process.env.TEST_FILLER_PK) {
      throw new Error('TEST_FILLER_PK not set')
    }
    URL = process.env.UNISWAPX_SERVICE_URL

    provider = new ethers.providers.StaticJsonRpcProvider(process.env.RPC_5)
    alice = new ethers.Wallet(process.env.TEST_WALLET_PK).connect(provider)
    filler = new ethers.Wallet(process.env.TEST_FILLER_PK).connect(provider)
    aliceAddress = (await alice.getAddress()).toLowerCase()

    weth = new Contract(WETH_GOERLI, abi, provider)
    uni = new Contract(UNI_GOERLI, abi, provider)

    // make sure filler wallet has enough ETH for gas
    const fillerMinBalance = ethers.utils.parseEther('0.1')
    if (!(await provider.getBalance(filler.address)).gte(fillerMinBalance)) {
      throw new Error('filler wallet does not has enough ETH for gas')
    }
    // // make sure both wallets have enough erc20 balance
    if (!((await uni.balanceOf(alice.address)) as BigNumber).gte(MIN_UNI_BALANCE)) {
      throw new Error('alice wallet does not have enough UNI')
    }
    if (!((await weth.balanceOf(alice.address)) as BigNumber).gte(MIN_WETH_BALANCE)) {
      throw new Error('alice wallet does not have enough WETH')
    }
    if (!((await uni.balanceOf(filler.address)) as BigNumber).gte(MIN_UNI_BALANCE)) {
      throw new Error('filler wallet does not have enough UNI')
    }
    if (!((await weth.balanceOf(filler.address)) as BigNumber).gte(MIN_WETH_BALANCE)) {
      throw new Error('filler wallet does not have enough ETH')
    }

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

    //     const reactorAddress = REACTOR_ADDRESS_MAPPING[ChainId.GÖRLI]['Dutch']
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
        axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
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

  async function waitAndGetOrderStatus(orderHash: string, deadlineSeconds: number) {
    /// We have to wait for the sfn to fire, so we wait a bit, and as long as the order's expiry is longer than that time period,
    ///      we can be sure that the order correctly expired based on the block.timestamp
    // The next retry is usually in 12 seconds but can take longer to complete
    const timeToWait = (deadlineSeconds + AVERAGE_BLOCK_TIME(ChainId.GÖRLI) * 2) * 1000
    await new Promise((resolve) => setTimeout(resolve, timeToWait))

    const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(1)
    const order = resp.data.orders[0]
    expect(order).toBeDefined()
    expect(order!.orderHash).toEqual(orderHash)
    return order!.orderStatus
  }

  const buildOrder = async (
    swapper: string,
    amount: BigNumber,
    deadlineSeconds: number,
    inputToken: string,
    outputToken: string
  ): Promise<{ order: DutchOrder; payload: { encodedOrder: string; signature: string; chainId: ChainId } }> => {
    const deadline = Math.round(new Date().getTime() / 1000) + deadlineSeconds
    const decayStartTime = Math.round(new Date().getTime() / 1000)
    const order = new DutchOrderBuilder(ChainId.GÖRLI)
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
        startAmount: amount,
        endAmount: amount,
        recipient: swapper,
      })
      .build()

    const { domain, types, values } = order.permitData()
    const signature = await alice._signTypedData(domain, types, values)
    const encodedOrder = order.serialize()

    return {
      order,
      payload: { encodedOrder: encodedOrder, signature: signature, chainId: ChainId.GÖRLI },
    }
  }

  const submitOrder = async (
    order: DutchOrder,
    payload: {
      encodedOrder: string
      signature: string
      chainId: ChainId
    }
  ): Promise<{
    order: DutchOrder
    signature: string
  }> => {
    try {
      const postResponse = await axios({
        method: 'post',
        url: `${URL}dutch-auction/order`,
        data: payload,
      })
      expect(postResponse.status).toEqual(201)
      return { order, signature: payload.signature }
    } catch (err: any) {
      console.log(err.message)
      throw err
    }
  }

  const buildAndSubmitOrder = async (
    swapper: string,
    amount: BigNumber,
    deadlineSeconds: number,
    inputToken: string,
    outputToken: string
  ): Promise<{
    order: DutchOrder
    signature: string
  }> => {
    const { order, payload } = await buildOrder(swapper, amount, deadlineSeconds, inputToken, outputToken)

    return submitOrder(order, payload)
  }

  const fillOrder = async (order: DutchOrder, signature: string) => {
    const execution: OrderExecution = {
      orders: [
        {
          order,
          signature,
        },
      ],
      reactor: REACTOR_ADDRESS_MAPPING[ChainId.GÖRLI]['Dutch']!,
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

  describe('orders endpoint sanity checks', () => {
    it.each([
      [{ orderStatus: 'open' }, 200],
      [{ chainId: 1 }, 200],
      [{ orderStatus: 'expired' }, 200],
      [{ swapper: '0x0000000000000000000000000000000000000000' }, 200],
      [{ filler: '0x0000000000000000000000000000000000000000' }, 200],
      [{ orderStatus: 'expired', sortKey: 'createdAt', chainId: 137 }, 200],
      [{ orderStatus: 'expired', sortKey: 'createdAt', desc: false }, 200],
      [{ orderStatus: 'expired', sortKey: 'createdAt', desc: true }, 200],
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
          const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?${queryParams}`)
          expect(resp.status).toEqual(200)
        } else {
          await expect(axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?${queryParams}`)).rejects.toMatchObject(
            {
              response: {
                status,
              },
            }
          )
        }
      }
    )
  })

  describe('order endpoint sanity checks', () => {
    it('2xx', async () => {
      await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, WETH_GOERLI, UNI_GOERLI)
    })

    it('4xx', async () => {
      const { order, payload } = await buildOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        WETH_GOERLI,
        UNI_GOERLI
      )
      await expect(submitOrder(order, { ...payload, chainId: 'xyz' } as any)).rejects.toMatchObject({
        response: {
          status: 400,
        },
      })
    })
  })

  describe('checking expiry', () => {
    it('erc20 to erc20', async () => {
      const { order } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        WETH_GOERLI,
        UNI_GOERLI
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()

      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 20)).toBe('expired')
    })

    it('erc20 to eth', async () => {
      const { order } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        UNI_GOERLI,
        ZERO_ADDRESS
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 20)).toBe('expired')
    })

    it('does not expire order before deadline', async () => {
      const { order } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        UNI_GOERLI,
        ZERO_ADDRESS
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), 0)).toBe('open')
    })
  })

  // TODO: Migrate to Sepolia/other test chain
  // GOERLI chain is deprecated.
  // 1. change RPC_5
  // 2. Deploy contracts
  // 3. fund wallets(alice,filler)
  describe.skip('+ attempt to fill', () => {
    it('erc20 to eth', async () => {
      const { order, signature } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        UNI_GOERLI,
        ZERO_ADDRESS
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      const txHash = await fillOrder(order, signature)
      expect(txHash).toBeDefined()
      expect(await waitAndGetOrderStatus(order.hash(), 0)).toBe('filled')
    })

    it('erc20 to erc20', async () => {
      const { order, signature } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        WETH_GOERLI,
        UNI_GOERLI
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      const txHash = await fillOrder(order, signature)
      expect(txHash).toBeDefined()
      expect(await waitAndGetOrderStatus(order.hash(), 0)).toBe('filled')
    })

    describe('checking cancel', () => {
      it('updates status to cancelled when fill reverts due to nonce reuse', async () => {
        const { order: order1, signature: sig1 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          WETH_GOERLI,
          UNI_GOERLI
        )
        const { order: order2, signature: sig2 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          UNI_GOERLI,
          ZERO_ADDRESS
        )
        expect(order1.info.nonce.toString()).toEqual(order2.info.nonce.toString())
        expect(await expectOrdersToBeOpen([order1.hash(), order2.hash()])).toBeTruthy()
        // fill the first one
        const txHash = await fillOrder(order1, sig1)
        expect(txHash).toBeDefined()
        expect(await waitAndGetOrderStatus(order1.hash(), 0)).toBe('filled')
        // try to fill the second one, expect revert
        try {
          await fillOrder(order2, sig2)
          expect(true).toBeFalsy()
        } catch (err: any) {
          expect(err.message.includes('transaction failed')).toBeTruthy()
        }
        expect(await waitAndGetOrderStatus(order2.hash(), 0)).toBe('cancelled')
      })

      xit('allows same swapper to post multiple orders with different nonces and be filled', async () => {
        const { order: order1, signature: sig1 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          WETH_GOERLI,
          UNI_GOERLI
        )
        nonce = nonce.add(1)
        const { order: order2, signature: sig2 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          UNI_GOERLI,
          ZERO_ADDRESS
        )
        expect(order2.info.nonce).toEqual(order1.info.nonce.add(1))
        expect(await expectOrdersToBeOpen([order1.hash(), order2.hash()])).toBeTruthy()
        const txHash = await fillOrder(order1, sig1)
        expect(txHash).toBeDefined()
        const txHash2 = await fillOrder(order2, sig2)
        expect(txHash2).toBeDefined()
        expect(await waitAndGetOrderStatus(order1.hash(), 0)).toBe('filled')
        expect(await waitAndGetOrderStatus(order2.hash(), 0)).toBe('filled')
      })
    })
  })
})
