/* eslint-disable @typescript-eslint/no-unused-vars */
// this currently tests:
// POST order endpoint
// GET orders endpoint
// TODO: test on chain validation step function
// TODO: test on chain execution

import { BigNumber, ethers, Wallet } from 'ethers'
import { DutchLimitOrderBuilder, NonceManager, PERMIT_POST_MAPPING, REACTOR_ADDRESS_MAPPING,  } from 'gouda-sdk'
import axios from 'axios'
import { ChainId } from '../../lib/util/chain'
import FieldValidator from '../../lib/util/field-validator'

const BASE_URL = process.env.BASE_URL || 'https://6lmon76wp5.execute-api.us-east-1.amazonaws.com/prod'
const submitLimitOrder = async (serializedOrder: string, signature: string, chainId: ChainId) => {
  try {
    const url = `${BASE_URL}/dutch-auction/order`
    const option = {
      method: 'post',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      data: JSON.stringify({
        encodedOrder: serializedOrder,
        signature,
        chainId,
      }),
      url,
    }
    const response = await axios(option)
    return response
  } catch (error: any) {
    throw new Error(error.message)
  }
}

const provider = new ethers.providers.JsonRpcProvider('https://rpc.tenderly.co/fork/7efbd554-1297-4289-9ca9-017391889bb2')
let orderId: string
describe('End to end test', () => {
  describe('POST order', () => {
    it('should successfully make post request and get order hash as response', async () => {
      const chainId = 1
      const nonceMgr = new NonceManager(provider, chainId);
      const nonce = await nonceMgr.useNonce(account);

      const deadline = Math.floor(new Date().getTime() / 1000) + 1000
      const builder = new DutchLimitOrderBuilder(
        chainId,
        REACTOR_ADDRESS_MAPPING[chainId].DutchLimit,
        PERMIT_POST_MAPPING[chainId]
      )
      const order = builder
        .deadline(deadline)
        .endTime(deadline)
        .startTime(deadline - 100)
        .nonce(BigNumber.from(100))
        .offerer('0x13Db718490d9580106332bDC075854A4BC597E3D')
        .input({
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          amount: BigNumber.from('1000000'),
        })
        .output({
          token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          startAmount: BigNumber.from('1000000000000000000'),
          endAmount: BigNumber.from('900000000000000000'),
          recipient: '0x0000000000000000000000000000000000000000',
        })
        .build()
      // Sign the built order 
      const { domain, types, values } = order.permitData();
      const wallet = new Wallet('', provider)
      const signature = await wallet._signTypedData(domain, types, values);

      const encodedOrder = order.serialize()
      const resp = await submitLimitOrder(encodedOrder, signature, chainId)

      expect(resp.status).toBeGreaterThanOrEqual(200)
      expect(resp.status).toBeLessThanOrEqual(202)
      expect(resp.data).toBeDefined()
      expect(resp.data.hash).toBeDefined()
      expect(FieldValidator.isValidOrderHash().validate(resp.data.hash)).toBeTruthy()
      orderId = resp.data.hash
    })
  })
  describe('GET orders', () => {
    it('should retrieve previously submitted order', async () => {
      const resp = await axios.get(`${BASE_URL}/dutch-auction/orders?orderHash=${orderId}`)
      expect(resp.status).toBeGreaterThanOrEqual(200)
      expect(resp.status).toBeLessThanOrEqual(202)
      expect(resp.data).toBeDefined()
      expect(resp.data.orders).toBeDefined()
      expect(resp.data.orders.length).toBeGreaterThan(0)
    })
  })
})
