import { DutchLimitOrderBuilder } from '@uniswap/gouda-sdk'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { ALICE_TEST_WALLET_PK, UNI, WETH } from './constants'

import * as ERC20_ABI from '../abis/erc20.json'
import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema'
import { ChainId } from '../../lib/util/chain'
const { abi } = ERC20_ABI

dotenv.config()

const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3'

describe('/dutch-auction/order', () => {
  jest.setTimeout(30 * 1000)
  let wallet: Wallet
  let provider: ethers.providers.JsonRpcProvider
  let aliceAddress: string
  let nonce: BigNumber
  let URL: string
  let weth: Contract

  beforeEach(async () => {
    if (!process.env.GOUDA_SERVICE_URL) {
      throw new Error('GOUDA_SERVICE_URL not set')
    }
    if (!process.env.RPC_TENDERLY) {
      throw new Error('RPC_TENDERLY not set')
    }
    URL = process.env.GOUDA_SERVICE_URL
    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_TENDERLY)

    wallet = new Wallet(ALICE_TEST_WALLET_PK, provider)
    aliceAddress = (await wallet.getAddress()).toLowerCase()

    weth = new Contract(WETH, abi, provider)
    // fund wallet if necessary
    const balance = (await weth.balanceOf(wallet.address)) as BigNumber
    if (balance.lt(ethers.utils.parseEther('10'))) {
      throw new Error(
        `Insufficient weth balance for integration tests using ${aliceAddress}. Expected at least 10 weth, got ${balance.toString()}`
      )
    }
    // approve P2
    await weth.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)

    const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(getResponse.status).toEqual(200)
    nonce = BigNumber.from(getResponse.data.nonce)
    expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()
  })

  async function expectOrderToBeOpen(orderHash: string) {
    // wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000))    
    // get orders
    const resp = await axios.get<GetOrdersResponse>(
      `${URL}dutch-auction/orders?orderHash=${orderHash}`
    )
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(1)
    const order = resp.data.orders[0]
    expect(order).toBeDefined()
    expect(order!.orderHash).toEqual(orderHash)
    expect(order!.orderStatus).toEqual('open')
  }

  async function expectOrderToExpire(orderHash: string, deadline: number) {
    const now = new Date().getTime() / 1000
    const waitTime = deadline - now
    console.log(`Waiting ${waitTime} seconds for order to expire`)
    // wait for order to expire
    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000))

    const resp = await axios.get<GetOrdersResponse>(
      `${URL}dutch-auction/orders?orderHash=${orderHash}`
    )
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(1)
    const order = resp.data.orders[0]
    expect(order).toBeDefined()
    expect(order!.orderHash).toEqual(orderHash)
    expect(order!.orderStatus).toEqual('expired')
  }

  it('erc20 to erc20', async () => {
    const amount = ethers.utils.parseEther('1')
    const deadline = Math.round(new Date().getTime() / 1000) + 5
    const order = new DutchLimitOrderBuilder(1)
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 5)
      .offerer(aliceAddress)
      .nonce(nonce.add(1))
      .input({
        token: WETH,
        startAmount: amount,
        endAmount: amount,
      })
      .output({
        token: UNI,
        startAmount: amount,
        endAmount: amount,
        recipient: aliceAddress,
      })
      .build()

    const { domain, types, values } = order.permitData()
    const signature = await wallet._signTypedData(domain, types, values)

    const encodedOrder = order.serialize()

    const postResponse = await axios.post<any>(
      `${URL}dutch-auction/order`,
      {
        encodedOrder,
        signature,
        chainId: ChainId.MAINNET,
      },
      {
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
        },
      }
    )

    expect(postResponse.status).toEqual(201)
    // orderHash = postResponse.data.hash
    const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(newGetResponse.status).toEqual(200)
    const newNonce = BigNumber.from(newGetResponse.data.nonce)
    expect(newNonce.eq(nonce.add(1))).toBeTruthy()

    await expectOrderToBeOpen(postResponse.data.hash)
    // await expectOrderToExpire(postResponse.data.hash, deadline)
  })

  it('erc20 to eth', async () => {
    const amount = ethers.utils.parseEther('1')
    // post order
    const deadline = Math.round(new Date().getTime() / 1000) + 5
    const order = new DutchLimitOrderBuilder(1)
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 5)
      .offerer(aliceAddress)
      .nonce(nonce.add(1))
      .input({
        token: WETH,
        startAmount: amount,
        endAmount: amount,
      })
      .output({
        token: UNI,
        startAmount: amount,
        endAmount: amount,
        recipient: aliceAddress,
      })
      .build()

      const { domain, types, values } = order.permitData()
      const signature = await wallet._signTypedData(domain, types, values)
  
      const encodedOrder = order.serialize()
  
      const postResponse = await axios.post<any>(
        `${URL}dutch-auction/order`,
        {
          encodedOrder,
          signature,
          chainId: ChainId.MAINNET,
        },
        {
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
          },
        }
      )
  
      expect(postResponse.status).toEqual(201)
      // orderHash = postResponse.data.hash
      const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
      expect(newGetResponse.status).toEqual(200)
      const newNonce = BigNumber.from(newGetResponse.data.nonce)
      expect(newNonce.eq(nonce.add(1))).toBeTruthy()
  
      await expectOrderToBeOpen(postResponse.data.hash)
      // await expectOrderToExpire(postResponse.data.hash, deadline)
  })
})
