import { DutchLimitOrderBuilder } from '@uniswap/gouda-sdk'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { ALICE_TEST_WALLET_PK, UNI, WETH } from './constants'
import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema/index'

import * as ERC20_ABI from '../abis/erc20.json'
const { abi } = ERC20_ABI

dotenv.config()

describe('/dutch-auction/order', () => {
  let wallet: Wallet
  let provider: ethers.providers.JsonRpcProvider
  let aliceAddress: string
  let nonce: BigNumber
  let URL: string
  let weth: Contract

  beforeEach(async () => {
    if(!process.env.GOUDA_SERVICE_URL) {
        throw new Error('GOUDA_SERVICE_URL not set')
    }
    if(!process.env.RPC_TENDERLY) {
        throw new Error('RPC_TENDERLY not set')
    }
    URL = process.env.GOUDA_SERVICE_URL
    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_TENDERLY)

    wallet = new Wallet(ALICE_TEST_WALLET_PK)
    aliceAddress = (await wallet.getAddress()).toLowerCase()

    weth = new Contract(WETH, abi, provider)
    // fund wallet if necessary
    const balance = await weth.balanceOf(wallet.address) as BigNumber
    if (balance.lt(ethers.utils.parseEther('10'))) {
        throw new Error(`Insufficient weth balance for integration tests using ${aliceAddress}. Expected at least 10 weth, got ${balance.toString()}`)
    }

    const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(getResponse.status).toEqual(200)
    nonce = BigNumber.from(getResponse.data.nonce)
    expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()
  })

  // base test case:
  // post order, get nonce, get orders, delete order
  it('erc20 to erc20', async () => {
    const amount = BigNumber.from(1).pow(18)
    // post order
    const deadline = Math.round(new Date().getTime() / 1000) + 10
    const order = new DutchLimitOrderBuilder(1)
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 5)
      .offerer(await wallet.getAddress())
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
        isFeeOutput: false,
      })
      .build()

    const { domain, types, values } = order.permitData()
    const signature = await wallet._signTypedData(domain, types, values)
    const postResponse = await axios.post(`${URL}dutch-auction/order`, {
      encodedOrder: order.serialize(),
      signature: signature,
      chainId: 1,
    })

    expect(postResponse.status).toEqual(201)
    // orderHash = postResponse.data.hash
    const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(newGetResponse.status).toEqual(200)
    const newNonce = BigNumber.from(newGetResponse.data.nonce)
    expect(newNonce.eq(nonce.add(1))).toBeTruthy()

    // get orders
    const getOrdersResponse = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${postResponse.data.hash}`)
    expect(getOrdersResponse.status).toEqual(200)
    expect(getOrdersResponse.data.orders.length).toEqual(1)
    const fetchedOrder = getOrdersResponse.data.orders[0]
    expect(fetchedOrder).toBeDefined()
    expect(fetchedOrder!.orderHash).toEqual(postResponse.data.hash)
    expect(fetchedOrder!.orderStatus).toEqual('unverified')
    // ensure that order is eventually verified and is marked as open
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const getOrdersResponse2 = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${postResponse.data.hash}`)
    expect(getOrdersResponse2.status).toEqual(200)
    expect(getOrdersResponse2.data.orders.length).toEqual(1)
    const fetchedOrder2 = getOrdersResponse2.data.orders[0]
    expect(fetchedOrder2).toBeDefined()
    expect(fetchedOrder2!.orderHash).toEqual(postResponse.data.hash)
    expect(fetchedOrder2!.orderStatus).toEqual('open')
  })
})
