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
      // storage location balances[aliceAddress]
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
      // storage location balances[aliceAddress]
      ethers.utils.keccak256(
        ethers.utils.concat([
          ethers.utils.hexZeroPad(aliceAddress, 32),
          ethers.utils.hexZeroPad('0x03', 32), // the balanceOf slot is 4th in the WETH contract
        ])
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
  })

  async function expectOrdersToBeOpen(orderHashes: string[]) {
    // wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000 * (1 + orderHashes.length * 0.5)))
    // get orders
    for (const orderHash of orderHashes) {
      const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
      expect(resp.status).toEqual(200)
      expect(resp.data.orders.length).toEqual(1)
      const order = resp.data.orders[0]
      expect(order).toBeDefined()
      expect(order!.orderHash).toEqual(orderHash)
      expect(order!.orderStatus).toEqual('open')
    }
  }

  /// Does not work now, keep getting open
  async function expectOrderToExpire(orderHash: string, deadline: number) {
    const now = new Date().getTime() / 1000
    const waitTime = Math.ceil(deadline - now)
    console.log(`Waiting ${waitTime} seconds for order to expire`)
    // wait for order to expire
    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000))

    // const params = [
    //   ethers.utils.hexValue(waitTime) // hex encoded number of seconds
    // ];

    // await provider.send('evm_increaseTime', params)

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
    deadline: number,
    inputToken: string,
    outputToken: string
  ) => {
    const order = new DutchLimitOrderBuilder(1)
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 5)
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

  it('erc20 to erc20', async () => {
    const amount = ethers.utils.parseEther('1')
    const deadline = Math.round(new Date().getTime() / 1000) + 5
    const orderHash = await buildAndSubmitOrder(aliceAddress, amount, deadline, WETH, UNI)
    await expectOrdersToBeOpen([orderHash])
    // await expectOrderToExpire(orderHash, deadline)
  })

  it('erc20 to eth', async () => {
    const amount = ethers.utils.parseEther('1')
    const deadline = Math.round(new Date().getTime() / 1000) + 5
    const orderHash = await buildAndSubmitOrder(aliceAddress, amount, deadline, UNI, ZERO_ADDRESS)
    await expectOrdersToBeOpen([orderHash])
    // await expectOrderToExpire(postResponse.data.hash, deadline)
  })

  it('allows same offerer to post multiple orders', async () => {
    const amount = ethers.utils.parseEther('1')
    const deadline = Math.round(new Date().getTime() / 1000) + 5
    const orderHash1 = await buildAndSubmitOrder(aliceAddress, amount, deadline, WETH, UNI)
    const orderHash2 = await buildAndSubmitOrder(aliceAddress, amount, deadline, UNI, ZERO_ADDRESS)
    await expectOrdersToBeOpen([orderHash1, orderHash2])
  })

  it('allows offerer to delete order', async () => {
    const amount = ethers.utils.parseEther('1')
    const deadline = Math.round(new Date().getTime() / 1000) + 5
    const orderHash = await buildAndSubmitOrder(aliceAddress, amount, deadline, WETH, UNI)
    await expectOrdersToBeOpen([orderHash])
    const deleteResponse = await axios.delete(`${URL}dutch-auction/order?orderHash=${orderHash}`)
    expect(deleteResponse.status).toEqual(200)
    const resp = await axios.get<GetOrdersResponse>(`${URL}dutch-auction/orders?orderHash=${orderHash}`)
    expect(resp.status).toEqual(200)
    expect(resp.data.orders.length).toEqual(0)
  })
})
