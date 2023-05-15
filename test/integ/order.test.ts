import { DutchLimitOrderBuilder } from '@uniswap/gouda-sdk'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { UNI, WETH, ZERO_ADDRESS } from './constants'

import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema'
import { ChainId } from '../../lib/util/chain'
import * as ERC20_ABI from '../abis/erc20.json'
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
  // Token contracts
  let weth: Contract
  let uni: Contract
  // Fork management
  let snap: null | string = null

  beforeAll(async () => {
    if (!process.env.GOUDA_SERVICE_URL) {
      throw new Error('GOUDA_SERVICE_URL not set')
    }
    if (!process.env.RPC_TENDERLY) {
      throw new Error('RPC_TENDERLY not set')
    }
    URL = process.env.GOUDA_SERVICE_URL

    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_TENDERLY)

    wallet = ethers.Wallet.createRandom().connect(provider)
    aliceAddress = (await wallet.getAddress()).toLowerCase()

    weth = new Contract(WETH, abi, provider)
    uni = new Contract(UNI, abi, provider)

    // Set alice's balance to 10 ETH
    await provider.send('tenderly_setBalance', [
      [aliceAddress],
      ethers.utils.hexValue(ethers.utils.parseUnits('10', 'ether').toHexString()),
    ])

    // Ensure alice has some WETH and UNI
    await provider.send('tenderly_setStorageAt', [
      UNI,
      ethers.utils.keccak256(
        ethers.utils.concat([
          ethers.utils.hexZeroPad(aliceAddress, 32),
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
        ethers.utils.concat([ethers.utils.hexZeroPad(aliceAddress, 32), ethers.utils.hexZeroPad('0x03', 32)])
      ),
      ethers.utils.hexZeroPad(ethers.utils.parseEther('20').toHexString(), 32),
    ])
    const wethBalance = (await weth.balanceOf(wallet.address)) as BigNumber
    expect(wethBalance).toEqual(ethers.utils.parseEther('20'))

    // approve P2
    await weth.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
    await uni.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)

    const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(getResponse.status).toEqual(200)
    nonce = BigNumber.from(getResponse.data.nonce)
    expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()

     // delete all orders with aliceAddress
     const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?offerer=${aliceAddress}`)
     expect(resp.status).toEqual(200)
     for (const order of resp.data.orders) {
       if (order) {
         const deleteResp = await axios.delete(`${URL}dutch-auction/order/${order.orderHash}`)
         expect(deleteResp.status).toEqual(200)
       }
     }
  })

  afterAll(async () => {
    // delete all orders with aliceAddress
    // const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?offerer=${aliceAddress}`)
    // expect(resp.status).toEqual(200)
    // for (const order of resp.data.orders) {
    //   if (order) {
    //     const deleteResp = await axios.delete(`${URL}dutch-auction/order/${order.orderHash}`)
    //     expect(deleteResp.status).toEqual(200)
    //   }
    // }
    // await deleteMainnetFork(forkId)
  })

  beforeEach(async () => {
    snap = await provider.send("evm_snapshot", []);
    console.log("Saved snap", snap)
  });

  afterEach(async () => {
    console.log("Reverting to snap", snap)
    await provider.send("evm_revert", [snap]);
  })

  async function expectOrdersToBeOpen(orderHashes: string[]) {
    console.log('orderHashes', orderHashes)
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
      console.log(`Order statuses: ${orderStatuses}`)
      if (orderStatuses.every((status) => status === 'open')) {
        return true
      }
      console.log('Waiting', 2 ** i * 1000)
      await new Promise((resolve) => setTimeout(resolve, 2 ** i * 1000))
    }
    console.log('Orders not open')
    return false
  }

  async function expectOrderToExpire(orderHash: string, deadlineSeconds: number) {
    // fast forward to order expiry
    const params = [
      ethers.utils.hexValue(deadlineSeconds), // hex encoded number of seconds
    ]

    console.log(await provider.getBlock('latest'))

    await provider.send('evm_increaseTime', params)
    await provider.send('evm_increaseBlocks', [
      ethers.utils.hexValue(1)
    ])

    console.log(await provider.getBlock('latest'))

    const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(1)
    const order = resp.data.orders[0]
    expect(order).toBeDefined()
    expect(order!.orderHash).toEqual(orderHash)
    expect(order!.orderStatus).toEqual('expired')
  }

  const buildAndSubmitOrder = async (
    offerer: string,
    amount: BigNumber,
    deadlineSeconds: number,
    inputToken: string,
    outputToken: string
  ) => {
    const deadline = Math.round(new Date().getTime() / 1000) + deadlineSeconds
    const order = new DutchLimitOrderBuilder(1)
      .deadline(deadline)
      .endTime(deadline)
      .startTime(Math.round(new Date().getTime() / 1000))
      .offerer(offerer)
      .nonce(nonce.add(1))
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
    const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${aliceAddress}`)
    expect(newGetResponse.status).toEqual(200)
    const newNonce = BigNumber.from(newGetResponse.data.nonce)
    expect(newNonce.eq(nonce.add(1))).toBeTruthy()

    return postResponse.data.hash
  }

  it.only('erc20 to erc20', async () => {
    const amount = ethers.utils.parseEther('1')
    const orderHash = await buildAndSubmitOrder(aliceAddress, amount, 3000, WETH, UNI)
    expect(await expectOrdersToBeOpen([orderHash])).toBeTruthy()
    await expectOrderToExpire(orderHash, 3500)
  })

  it('erc20 to eth', async () => {
    const amount = ethers.utils.parseEther('1')
    const orderHash = await buildAndSubmitOrder(aliceAddress, amount, 5, UNI, ZERO_ADDRESS)
    expect(await expectOrdersToBeOpen([orderHash])).toBeTruthy()
    // await expectOrderToExpire(postResponse.data.hash, deadline)
  })

  it('allows same offerer to post multiple orders', async () => {
    const amount = ethers.utils.parseEther('1')
    const orderHash1 = await buildAndSubmitOrder(aliceAddress, amount, 5, WETH, UNI)
    const orderHash2 = await buildAndSubmitOrder(aliceAddress, amount, 5, UNI, ZERO_ADDRESS)
    expect(await expectOrdersToBeOpen([orderHash1, orderHash2])).toBeTruthy()
  })

  it('allows offerer to delete order', async () => {
    const amount = ethers.utils.parseEther('1')
    const orderHash = await buildAndSubmitOrder(aliceAddress, amount, 5, WETH, UNI)
    await expectOrdersToBeOpen([orderHash])
    const deleteResponse = await axios.delete(`${URL}dutch-auction/order?orderHash=${orderHash}`)
    expect(deleteResponse.status).toEqual(200)
    const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(0)
  })

  it('allows offerer to delete order made before latest order', async () => {
    const amount = ethers.utils.parseEther('1')
    const orderHash1 = await buildAndSubmitOrder(aliceAddress, amount, 5, WETH, UNI)
    const orderHash2 = await buildAndSubmitOrder(aliceAddress, amount, 5, UNI, ZERO_ADDRESS)
    const deleteResponse = await axios.delete(`${URL}dutch-auction/order?orderHash=${orderHash1}`)
    expect(deleteResponse.status).toEqual(200)
    const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash2}`)
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(1)
    await expectOrdersToBeOpen([orderHash2])
  })
})
