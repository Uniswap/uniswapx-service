import { DutchOrder, DutchOrderBuilder, REACTOR_ADDRESS_MAPPING, SignedOrder } from '@uniswap/gouda-sdk'
import { factories } from '@uniswap/gouda-sdk/dist/src/contracts/index'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { PERMIT2, UNI, WETH, ZERO_ADDRESS } from './constants'

const { DutchLimitOrderReactor__factory } = factories

import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema'
import { ChainId } from '../../lib/util/chain'
import * as ERC20_ABI from '../abis/erc20.json'
import * as PERMIT2_ABI from '../abis/permit2.json'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../../lib/handlers/check-order-status/handler'
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

describe('/dutch-auction/order', () => {
  const DEFAULT_DEADLINE_SECONDS = 500
  jest.setTimeout(60 * 1000)
  let alice: Wallet
  let filler: Wallet
  let provider: ethers.providers.JsonRpcProvider
  let aliceAddress: string
  let nonce: BigNumber
  let URL: string
  // Token contracts
  let weth: Contract
  let uni: Contract
  // Fork management
  let snap: null | string = null
  let checkpointedBlock: ethers.providers.Block
  let blockOffsetCounter: number = 0

  beforeAll(async () => {
    if (!process.env.GOUDA_SERVICE_URL) {
      throw new Error('GOUDA_SERVICE_URL not set')
    }
    if (!process.env.RPC_12341234) {
      throw new Error('RPC_12341234 not set')
    }
    URL = process.env.GOUDA_SERVICE_URL

    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_12341234)

    // advance blocks to avoid mixing fill events with previous test runs
    const startingBlockNumber = (await provider.getBlock('latest')).number
    await provider.send('evm_increaseBlocks', [ethers.utils.hexValue(FILL_EVENT_LOOKBACK_BLOCKS_ON(ChainId.TENDERLY))])
    expect((await provider.getBlock('latest')).number).toEqual(startingBlockNumber + FILL_EVENT_LOOKBACK_BLOCKS_ON(ChainId.TENDERLY))

    alice = ethers.Wallet.createRandom().connect(provider)
    filler = ethers.Wallet.createRandom().connect(provider)
    aliceAddress = (await alice.getAddress()).toLowerCase()

    weth = new Contract(WETH, abi, provider)
    uni = new Contract(UNI, abi, provider)
    const permit2Contract = new Contract(PERMIT2, permit2Abi, provider)

    const fundWallets = async (wallets: Wallet[]) => {
      for (const wallet of wallets) {
        await provider.send('tenderly_setBalance', [
          [wallet.address],
          ethers.utils.hexValue(ethers.utils.parseUnits('10', 'ether').toHexString()),
        ])
        expect(await provider.getBalance(wallet.address)).toEqual(ethers.utils.parseEther('10'))
        // Ensure both alice and filler have WETH and UNI
        await provider.send('tenderly_setStorageAt', [
          UNI,
          ethers.utils.keccak256(
            ethers.utils.concat([
              ethers.utils.hexZeroPad(wallet.address, 32),
              ethers.utils.hexZeroPad('0x04', 32), // the balances slot is 4th in the UNI contract
            ])
          ),
          ethers.utils.hexZeroPad(ethers.utils.parseEther('20').toHexString(), 32),
        ])
        const uniBalance = (await uni.balanceOf(wallet.address)) as BigNumber
        expect(uniBalance).toEqual(ethers.utils.parseEther('20'))

        await provider.send('tenderly_setStorageAt', [
          WETH,
          ethers.utils.keccak256(
            ethers.utils.concat([ethers.utils.hexZeroPad(wallet.address, 32), ethers.utils.hexZeroPad('0x03', 32)])
          ),
          ethers.utils.hexZeroPad(ethers.utils.parseEther('20').toHexString(), 32),
        ])
        const wethBalance = (await weth.balanceOf(wallet.address)) as BigNumber
        expect(wethBalance).toEqual(ethers.utils.parseEther('20'))

        // approve P2
        await weth.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
        await uni.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
        // approve reactor for permit2
        await permit2Contract
          .connect(wallet)
          .approve(
            weth.address,
            REACTOR_ADDRESS_MAPPING[ChainId.MAINNET]['Dutch'],
            ethers.utils.parseEther('100'),
            281474976710655
          )
        await permit2Contract
          .connect(wallet)
          .approve(
            uni.address,
            REACTOR_ADDRESS_MAPPING[ChainId.MAINNET]['Dutch'],
            ethers.utils.parseEther('100'),
            281474976710655
          )
      }
    }

    await fundWallets([alice, filler])

    const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(getResponse.status).toEqual(200)
    nonce = BigNumber.from(getResponse.data.nonce)
    expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()
  })

  beforeEach(async () => {
    checkpointedBlock = await provider.getBlock('latest')
    snap = await provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await provider.send('evm_revert', [snap])
    expect(await provider.getBlock('latest')).toEqual(checkpointedBlock)
  })

  async function expectOrdersToBeOpen(orderHashes: string[]) {
    // check that orders are open, retrying if status is unverified, with exponential backoff
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
    /// @dev testing order status updates via the step function is very finicky
    ///      we fast forward the fork's timestamp by the deadline and then mine a block to get the changes included
    /// However, we have to wait for the sfn to fire again, so we wait a bit, and as long as the order's expiry is longer than that time period,
    ///      we can be sure that the order correctly expired based on the block.timestamp
    const params = [
      ethers.utils.hexValue(deadlineSeconds), // hex encoded number of seconds
    ]
    await provider.send('evm_increaseTime', params)
    const blockNumber = (await provider.getBlock('latest')).number
    const blocksToMine = 1
    await provider.send('evm_increaseBlocks', [ethers.utils.hexValue(blocksToMine)])
    expect((await provider.getBlock('latest')).number).toEqual(blockNumber + blocksToMine)
    // Wait a bit for sfn to fire again
    // The next retry is in 12 seconds
    await new Promise((resolve) => setTimeout(resolve, 15_000))

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
    const order = new DutchOrderBuilder(ChainId.MAINNET)
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

    try {
      const postResponse = await axios.post<any>(
        `${URL}dutch-auction/order`,
        {
          encodedOrder,
          signature,
          chainId: ChainId.TENDERLY,
        },
        {
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
          },
        }
      )
      expect(postResponse.status).toEqual(201)
      const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
      expect(newGetResponse.status).toEqual(200)
      const newNonce = BigNumber.from(newGetResponse.data.nonce)
      expect(newNonce.eq(nonce.add(1))).toBeTruthy()
      
      console.log("built order", order.hash())

      return { order, signature }
    } catch (err: any) {
      console.log(err)
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
      reactor: REACTOR_ADDRESS_MAPPING[ChainId.MAINNET]['Dutch'],
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
        maxPriorityFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
        value,
      }
    )

    populatedTx.gasLimit = BigNumber.from(700_000)
    
    const tx = await filler.sendTransaction(populatedTx)
    const receipt = await tx.wait()
    console.log(receipt.transactionHash)
    return receipt.transactionHash
  }

  xdescribe('checking expiry', () => {
    it('erc20 to erc20', async () => {
      const amount = ethers.utils.parseEther('1')
      const { order } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, WETH, UNI)
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 1)).toBe('expired')
    })

    it('erc20 to eth', async () => {
      const amount = ethers.utils.parseEther('1')
      const { order } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, UNI, ZERO_ADDRESS)
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 1)).toBe('expired')
    })

    it('does not expire order before deadline', async () => {
      const amount = ethers.utils.parseEther('1')
      const { order } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, UNI, ZERO_ADDRESS)
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS - 100)).toBe('open')
    })
  })

  const advanceBlocks = async (numBlocks: number) => {
    if(numBlocks == 0) {
      return
    }
    await provider.send('evm_increaseBlocks', [ethers.utils.hexValue(numBlocks)])
    expect((await provider.getBlock('latest')).number).toEqual(checkpointedBlock.number + numBlocks)
  }

  describe('+ attempt to fill', () => {
    // The SFN will get fill logs for all orders that were filled in the last 10 blocks
    // However, since we are performing a re-org by reverting the chain after every test,
    // many of these orders will no longer exist (thus the provider call for the txnHash will fail)
    // So, we keep a running total of the offset from the current block number to advance the chain by every time
    beforeEach(async () => {
      await advanceBlocks(blockOffsetCounter)
    })

    afterEach(async () => {
      // Some reason we need extra buffer here ontop of the lookback block period
      // Fails with 1, works with 10
      blockOffsetCounter += (FILL_EVENT_LOOKBACK_BLOCKS_ON(ChainId.TENDERLY) + 10)
    })

    it('erc20 to eth', async () => {
      const amount = ethers.utils.parseEther('1')
      const { order, signature } = await buildAndSubmitOrder(
        aliceAddress,
        amount,
        DEFAULT_DEADLINE_SECONDS,
        UNI,
        ZERO_ADDRESS
      )
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      const txHash = await fillOrder(order, signature)
      expect(txHash).toBeDefined()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 1)).toBe('filled')
    })

    it('erc20 to erc20', async () => {
      const amount = ethers.utils.parseEther('1')
      const { order, signature } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, WETH, UNI)
      console.log("second order hash", order.hash())
      expect(await expectOrdersToBeOpen([order.hash()])).toBeTruthy()
      const txHash = await fillOrder(order, signature)
      expect(txHash).toBeDefined()
      expect(await waitAndGetOrderStatus(order.hash(), DEFAULT_DEADLINE_SECONDS + 1)).toBe('filled')
    })

    describe('checking cancel', () => {
      it('updates status to cancelled when fill reverts due to nonce reuse', async () => {
        const amount = ethers.utils.parseEther('1')
        const { order: order1, signature: sig1 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          WETH,
          UNI
        )
        const { order: order2, signature: sig2 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          UNI,
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
          expect(err.message.includes('transaction failed')).toBeTruthy();
        }
        expect(await waitAndGetOrderStatus(order2.hash(), 0)).toBe('cancelled')
      })
  
      it('allows same offerer to post multiple orders with different nonces and be filled', async () => {
        const amount = ethers.utils.parseEther('1')
        const { order: order1, signature: sig1 } = await buildAndSubmitOrder(aliceAddress, amount, DEFAULT_DEADLINE_SECONDS, WETH, UNI)
        nonce = nonce.add(1)
        const { order: order2, signature: sig2 } = await buildAndSubmitOrder(
          aliceAddress,
          amount,
          DEFAULT_DEADLINE_SECONDS,
          UNI,
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
