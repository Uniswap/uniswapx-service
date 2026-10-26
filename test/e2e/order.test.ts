/* eslint-disable jest/no-disabled-tests */
import { UnsignedV2DutchOrder, V2DutchOrderBuilder } from '@uniswap/uniswapx-sdk'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, Contract, ethers, Wallet } from 'ethers'
import { MAX_UINT96, PERMIT2, UNI, WETH } from './constants'
import { v4 as uuidv4 } from 'uuid'

import { UniswapXOrderEntity } from '../../lib/entities'
import { GetOrdersResponse } from '../../lib/handlers/get-orders/schema/GetOrdersResponse'
import { ChainId } from '../../lib/util/chain'
import * as ERC20_ABI from './abis/erc20.json'
import { RPC_HEADERS } from '../../lib/util/constants'
const { abi } = ERC20_ABI

dotenv.config()

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
// const MIN_WETH_BALANCE = ethers.utils.parseEther('0.05')
// const MIN_UNI_BALANCE = ethers.utils.parseEther('0.05')

describe('/dutch-auction/order', () => {
  jest.setTimeout(240 * 1000)
  jest.retryTimes(2)
  let alice: Wallet
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

    // approve Permit2
    checkApprovals(uni, alice)

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

  // Set max allowance for Permit2 on each token if not set already
  async function checkApprovals(tokenContract: Contract, wallet: Wallet) {
    console.log(`Checking approvals for wallet ${wallet.address}`)
    // check approvals on Permit2
    const allowance = await tokenContract.allowance(wallet.address, PERMIT2)
    if (allowance.lt(MAX_UINT96)) {
      console.log(`Approving max allowance for PERMIT2 for ${tokenContract.address}`)
      const receipt = await tokenContract.connect(wallet).approve(PERMIT2, ethers.constants.MaxUint256)
      await receipt.wait()
    }
  }

  describe('order endpoint sanity checks', () => {
    
    /**
     * Currently the only test that runs
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
  })

  describe.skip('orders endpoint sanity checks', () => {
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
})
