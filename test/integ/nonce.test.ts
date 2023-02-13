import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, ethers } from 'ethers'
import { DutchLimitOrderBuilder } from 'gouda-sdk'
import { checkDefined } from '../../lib/preconditions/preconditions'
dotenv.config()

const ANVIL_TEST_WALLET_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const URL = checkDefined(process.env.GOUDA_SERVICE_URL, 'GOUDA_SERVICE_URL must be defined')

const wallet = new ethers.Wallet(ANVIL_TEST_WALLET_PK)
const amount = BigNumber.from(10).pow(18)

describe('get nonce', () => {
  //TODO: uncomment once delete handler is deployed
  // let orderHash: string

  // afterAll(async () => {
  //   await axios.delete(`${URL}dutch-auction/order?orderHash=${orderHash}`)
  // })

  it('should get current nonce for address, and increment it by one after the address posts an order', async () => {
    const address = await (await wallet.getAddress()).toLowerCase()
    const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${address}`)
    expect(getResponse.status).toEqual(200)
    const nonce = BigNumber.from(getResponse.data.nonce)
    expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()

    const deadline = Math.round(new Date().getTime() / 1000) + 10
    const order = new DutchLimitOrderBuilder(1)
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 5)
      .offerer(await wallet.getAddress())
      .nonce(nonce.add(1))
      .input({
        token: ZERO_ADDRESS,
        startAmount: amount,
        endAmount: amount,
      })
      .output({
        token: ZERO_ADDRESS,
        startAmount: amount,
        endAmount: amount,
        recipient: address,
        isFeeOutput: false,
      })
      .build()

    const { domain, types, values } = order.permitData()
    const signature = await wallet._signTypedData(domain, types, values)
    //    console.log(order.serialize())
    const postResponse = await axios.post(`${URL}dutch-auction/order`, {
      encodedOrder: order.serialize(),
      signature: signature,
      chainId: 1,
    })

    expect(postResponse.status).toEqual(201)
    orderHash = postResponse.data.hash
    const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${address}`)
    expect(newGetResponse.status).toEqual(200)
    console.log(`new: ${newGetResponse.data.nonce}; old: ${getResponse.data.nonce}`)
    const newNonce = BigNumber.from(newGetResponse.data.nonce)
    expect(newNonce.eq(nonce.add(1))).toBeTruthy()
  })
})
