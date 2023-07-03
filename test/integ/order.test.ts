import { DutchOrder, DutchOrderBuilder, REACTOR_ADDRESS_MAPPING, SignedOrder } from '@uniswap/gouda-sdk'
import { factories } from '@uniswap/gouda-sdk/dist/src/contracts/index'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { PERMIT2, UNI_GOERLI, WETH_GOERLI, ZERO_ADDRESS } from './constants'

const { DutchLimitOrderReactor__factory } = factories

import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema'
import { ChainId } from '../../lib/util/chain'
import * as ERC20_ABI from '../abis/erc20.json'
import * as PERMIT2_ABI from '../abis/permit2.json'
import { AVERAGE_BLOCK_TIME } from '../../lib/handlers/check-order-status/handler'
const { abi } = ERC20_ABI
const { abi: permit2Abi } = PERMIT2_ABI

dotenv.config()

type OrderExecution = {
  orders: SignedOrder[]
  reactor: string
  fillContract: string
  fillData: string
}

// if the CLI argument runInBand is not provided, throw
if (!process.argv.includes('--runInBand')) {
  throw new Error('Integration tests must be run with --runInBand flag')
}

// constants
const MIN_WETH_BALANCE = ethers.utils.parseEther('0.1')
const MIN_UNI_BALANCE = ethers.utils.parseEther('1')
const MAX_UINT_160 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffff')

describe('/dutch-auction/order', () => {
  const DEFAULT_DEADLINE_SECONDS = 24
  jest.setTimeout(180 * 1000)
  jest.retryTimes(2)
  let alice: Wallet
  let filler: Wallet
  let provider: ethers.providers.JsonRpcProvider
  let aliceAddress: string
  let nonce: BigNumber
  let URL: string
  // Token contracts
  let weth: Contract
  let uni: Contract
  
  // trade amount for every test
  const amount = ethers.utils.parseEther('0.01')

  beforeAll(async () => {
    if (!process.env.GOUDA_SERVICE_URL) {
      throw new Error('GOUDA_SERVICE_URL not set')
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
    URL = process.env.GOUDA_SERVICE_URL

    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_5)
    alice = new ethers.Wallet(process.env.TEST_WALLET_PK).connect(provider)
    filler = new ethers.Wallet(process.env.TEST_FILLER_PK).connect(provider)
    aliceAddress = (await alice.getAddress()).toLowerCase()

    weth = new Contract(WETH_GOERLI, abi, provider)
    uni = new Contract(UNI_GOERLI, abi, provider)
    const permit2Contract = new Contract(PERMIT2, permit2Abi, provider)

    // make sure filler wallet has enough ETH
    const fillerMinBalance = ethers.utils.parseEther('1')
    expect((await provider.getBalance(filler.address)).gte(fillerMinBalance)).toBe(true)
    // make sure alice has enough erc20 balance
    const uniBalance = (await uni.balanceOf(alice.address)) as BigNumber
    expect(uniBalance.gte(MIN_UNI_BALANCE)).toBe(true)
    const wethBalance = (await weth.balanceOf(alice.address)) as BigNumber
    expect(wethBalance.gte(MIN_WETH_BALANCE)).toBe(true)

    const checkApprovals = async (wallets: Wallet[]) => {
      for (const wallet of wallets) {
        // check approvals on Permit2
        const wethAllowance = await weth.allowance(wallet.address, PERMIT2)
        const uniAllowance = await uni.allowance(wallet.address, PERMIT2)
        if (wethAllowance.lt(ethers.constants.MaxUint256.div(2))) {
          const receipt = await weth.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
          await receipt.wait()
        }
        if (uniAllowance.lt(ethers.constants.MaxUint256.div(2))) {
          const receipt = await uni.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
          await receipt.wait()
        }
        // check approvals on reactor
        const reactorWethAllowance = await permit2Contract
          .connect(wallet)
          .allowance(
            wallet.address,
            weth.address,
            REACTOR_ADDRESS_MAPPING[ChainId.GÖRLI]['Dutch'],
          )   
        if(!(reactorWethAllowance[0] as BigNumber).eq(MAX_UINT_160)) {
          const receipt = await permit2Contract
            .connect(wallet)
            .approve(
              weth.address,
              REACTOR_ADDRESS_MAPPING[ChainId.GÖRLI]['Dutch'],
              MAX_UINT_160,
              281474976710655 // max deadline too
            )
          await receipt.wait()
        }
        const reactorUniAllowance = await permit2Contract
          .connect(wallet)
          .allowance(
            wallet.address,
            uni.address,
            REACTOR_ADDRESS_MAPPING[ChainId.GÖRLI]['Dutch'],
          )
        if(!(reactorUniAllowance[0] as BigNumber).eq(MAX_UINT_160)) {
          const receipt = await permit2Contract
            .connect(wallet)
            .approve(
              uni.address,
              REACTOR_ADDRESS_MAPPING[ChainId.GÖRLI]['Dutch'],
              MAX_UINT_160,
              281474976710655
            )
          await receipt.wait()
        }
      }
    }

    await checkApprovals([alice, filler])

    const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(getResponse.status).toEqual(200)
    nonce = BigNumber.from(getResponse.data.nonce)
    expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()
  })

  async function expectOrdersToBeOpen(orderHashes: string[]) {
    // check that orders are open, retrying if status is unverified, with backoff
    for (let i = 0; i < 5; i++) {
      const promises = orderHashes.map((orderHash) =>
        axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
      )
      const responses = await Promise.all(promises)
      expect(responses.every((resp) => resp.status === 200))
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
    await new Promise((resolve) => setTimeout(resolve, deadlineSeconds + AVERAGE_BLOCK_TIME(ChainId.GÖRLI) * 1000))

    const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(1)
    const order = resp.data.orders[0]
    expect(order).toBeDefined()
    expect(order!.orderHash).toEqual(orderHash)
    return order!.orderStatus
  }

  const buildAndSubmitOrder = async (
    offerer: string,
    amount: BigNumber,
    deadlineSeconds: number,
    inputToken: string,
    outputToken: string
  ): Promise<{
    order: DutchOrder
    signature: string
  }> => {
    const deadline = Math.round(new Date().getTime() / 1000) + deadlineSeconds
    const startTime = Math.round(new Date().getTime() / 1000)
    const nextNonce = nonce.add(1)
    const order = new DutchOrderBuilder(ChainId.GÖRLI)
      .deadline(deadline)
      .endTime(deadline)
      .startTime(startTime)
      .offerer(offerer)
      .nonce(nextNonce)
      .input({
        token: inputToken,
        startAmount: amount,
        endAmount: amount,
      })
      .output({
        token: outputToken,
        startAmount: amount,
        endAmount: amount,
        recipient: offerer,
      })
      .build()

    const { domain, types, values } = order.permitData()
    const signature = await alice._signTypedData(domain, types, values)
    const encodedOrder = order.serialize()

    console.log(order.toJSON())

    try {
      const postResponse = await axios.post<any>(
        `${URL}dutch-auction/order`,
        {
          encodedOrder,
          signature,
          chainId: ChainId.GÖRLI,
        },
        {
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
          },
        }
      )
      expect(postResponse.status).toEqual(201)
      const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}&chainId=${ChainId.GÖRLI}}`)
      expect(newGetResponse.status).toEqual(200)
      const newNonce = BigNumber.from(newGetResponse.data.nonce)
      expect(newNonce.eq(nonce.add(1))).toBeTruthy()
      return { order, signature }
    } catch (err: any) {
      console.log(err.message)
      throw err
    }
  }

  const fillOrder = async (order: DutchOrder, signature: string) => {
    const execution: OrderExecution = {
      orders: [
        {
          order,
          signature,
        },
      ],
      reactor: REACTOR_ADDRESS_MAPPING[ChainId.GÖRLI]['Dutch'],
      // direct fill is 0x01
      fillContract: '0x0000000000000000000000000000000000000001',
      fillData: '0x',
    }

    // if output token is ETH, then the value is the amount of ETH to send
    const value = order.info.outputs[0].token == ZERO_ADDRESS ? order.info.outputs[0].startAmount : 0

    const reactor = DutchLimitOrderReactor__factory.connect(execution.reactor, provider)
    const fillerNonce = await filler.getTransactionCount()
    const maxFeePerGas = (await provider.getFeeData()).maxFeePerGas

    const populatedTx = await reactor.populateTransaction.executeBatch(
      execution.orders.map((order) => {
        return {
          order: order.order.serialize(),
          sig: order.signature,
        }
      }),
      execution.fillContract,
      execution.fillData,
      {
        gasLimit: BigNumber.from(700_000),
        nonce: fillerNonce,
        ...(maxFeePerGas && { maxFeePerGas }),
        maxPriorityFeePerGas: ethers.utils.parseUnits('5', 'gwei'),
        value,
      }
    )

    populatedTx.gasLimit = BigNumber.from(700_000)

    const tx = await filler.sendTransaction(populatedTx)
    const receipt = await tx.wait()
    return receipt.transactionHash
  }

  xdescribe('endpoint sanity checks', () => {
    it.each([
      [{ orderStatus: 'open' }],
      [{ chainId: 1 }],
      [{ orderStatus: 'expired' }],
      [{ offerer: '0x0000000000000000000000000000000000000000' }],
      [{ filler: '0x0000000000000000000000000000000000000000' }],
      [{ orderStatus: 'expired', sortKey: 'createdAt', chainId: 137 }],
      [{ orderStatus: 'expired', sortKey: 'createdAt', desc: false }],
      [{ orderStatus: 'expired', sortKey: 'createdAt', desc: true }],
      [{ orderStatus: 'expired', offerer: '0x0000000000000000000000000000000000000000' }],
      [{ orderStatus: 'expired', filler: '0x0000000000000000000000000000000000000000' }],
      [{ orderHash: '0x0000000000000000000000000000000000000000000000000000000000000000' }],
      [
        {
          orderHashes:
            '0x0000000000000000000000000000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000000000000000000000000000',
        },
      ],
    ])(
      'Fetches orders with the following query param %p',
      async (queryFilters: { [key: string]: string | boolean | number }) => {
        const params = Object.keys(queryFilters)
        const queryParams = params.reduce((acc, key) => {
          const value = `${acc}${key}=${queryFilters[key]}`
          return key == params[params.length - 1] ? value : value + '&'
        }, '')

        const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?${queryParams}`)
        expect(resp.status).toEqual(200)
      }
    )
  })

  describe.only('checking expiry', () => {
    it.only('erc20 to erc20', async () => {
      const { order } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, WETH_GOERLI, UNI_GOERLI)
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 1)).toBe('expired')
    })

    it('erc20 to eth', async () => {
      const { order } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, UNI_GOERLI, ZERO_ADDRESS)
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 1)).toBe('expired')
    })

    it('does not expire order before deadline', async () => {
      const { order } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, UNI_GOERLI, ZERO_ADDRESS)
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS - AVERAGE_BLOCK_TIME(ChainId.GÖRLI))).toBe('open')
    })
  })

  describe('+ attempt to fill', () => {
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
      const { order, signature } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, WETH_GOERLI, UNI_GOERLI)
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

      it('allows same offerer to post multiple orders with different nonces and be filled', async () => {
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
        expect(await expectOrdersToBeOpen([order1.hash(), order2.hash()])).toBeTruthy()
        const txHash = await fillOrder(order1, sig1)
        expect(txHash).toBeDefined()
        expect(await waitAndGetOrderStatus(order1.hash(), 0)).toBe('filled')
        const txHash2 = await fillOrder(order2, sig2)
        expect(txHash2).toBeDefined()
        expect(await waitAndGetOrderStatus(order2.hash(), 0)).toBe('filled')
      })
    })
  })
})
