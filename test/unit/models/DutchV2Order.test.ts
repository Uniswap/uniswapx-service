import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { GetDutchV2OrderResponse } from '../../../lib/handlers/get-orders/schema/GetDutchV2OrderResponse'
import { DutchV2Order } from '../../../lib/models'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { MOCK_SIGNATURE } from '../../test-data'
import { mock } from 'jest-mock-extended'
import { Logger } from '@aws-lambda-powertools/logger'
import { BigNumber } from 'ethers'
import { Tokens } from '../fixtures'

describe('DutchV2 Model', () => {
  const log = mock<Logger>()
  test('toEntity', () => {
    const order = new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), MOCK_SIGNATURE, ChainId.MAINNET)
    const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

    expect(entity.signature).toEqual(MOCK_SIGNATURE)
    expect(entity.encodedOrder).toEqual(order.inner.serialize())
    expect(entity.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(entity.orderHash).toEqual(order.inner.hash())
    expect(entity.type).toEqual(OrderType.Dutch_V2)
  })

  test('fromEntity', () => {
    const order = new DutchV2Order(
      SDKDutchOrderV2Factory.buildDutchV2Order(),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      ORDER_STATUS.OPEN,
      undefined,
      undefined,
      undefined,
      100
    )
    const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)
    const fromEntity = DutchV2Order.fromEntity(entity, log)

    expect(order).toEqual(fromEntity)
    expect(order.createdAt).toEqual(100)
  })

  test('toGetResponse', () => {
    const order = new DutchV2Order(
      SDKDutchOrderV2Factory.buildDutchV2Order(),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      ORDER_STATUS.OPEN,
      undefined,
      undefined,
      undefined,
      100
    )
    const response: GetDutchV2OrderResponse = order.toGetResponse()

    expect(response.type).toEqual(OrderType.Dutch_V2)
    expect(response.orderStatus).toEqual(order.orderStatus)
    expect(response.signature).toEqual(order.signature)
    expect(response.encodedOrder).toEqual(order.inner.serialize())
    expect(response.chainId).toEqual(order.chainId)
    expect(response.orderHash).toEqual(order.inner.hash())
    expect(response.swapper).toEqual(order.inner.info.swapper)
    expect(response.reactor).toEqual(order.inner.info.reactor)
    expect(response.deadline).toEqual(order.inner.info.deadline)
    expect(response.input.token).toEqual(order.inner.info.input.token)
    expect(response.input.startAmount).toEqual(order.inner.info.input.startAmount.toString())
    expect(response.input.endAmount).toEqual(order.inner.info.input.endAmount.toString())
    response.outputs.forEach((o, i) => {
      expect(o.startAmount).toEqual(order.inner.info.outputs[i].startAmount.toString())
      expect(o.endAmount).toEqual(order.inner.info.outputs[i].endAmount.toString())
      expect(o.token).toEqual(order.inner.info.outputs[i].token)
      expect(o.recipient).toEqual(order.inner.info.outputs[i].recipient)
    })
    expect(response.cosignature).toEqual(order.inner.info.cosignature)
    expect(response.cosignerData.decayEndTime).toEqual(order.inner.info.cosignerData.decayEndTime)
    expect(response.cosignerData.decayStartTime).toEqual(order.inner.info.cosignerData.decayStartTime)
    expect(response.cosignerData.exclusiveFiller).toEqual(order.inner.info.cosignerData.exclusiveFiller)
    expect(response.cosignerData.inputOverride).toEqual(order.inner.info.cosignerData.inputOverride.toString())
    response.cosignerData.outputOverrides.forEach((o, i) => {
      expect(o).toEqual(order.inner.info.cosignerData.outputOverrides[i].toString())
    })
    expect(order.createdAt).toEqual(100)
  })

  describe('toGetResponse effective amounts', () => {
    // Fillers price off these fields, so they must report what the reactor moves rather
    // than the signed base amounts. Overrides are only applied when non-zero.
    const order = () =>
      new DutchV2Order(
        SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
          input: { token: Tokens.MAINNET.USDC, startAmount: '2000000', endAmount: '2000000' },
          outputs: [
            { token: Tokens.MAINNET.WETH, startAmount: '1000000000000000000', endAmount: '900000000000000000' },
            { token: Tokens.MAINNET.WETH, startAmount: '1000000000000000', endAmount: '900000000000000' },
          ],
          cosignerData: {
            inputOverride: '1500000',
            outputOverrides: ['1100000000000000000', '1000000000000000'],
          },
        }),
        MOCK_SIGNATURE,
        ChainId.MAINNET,
        ORDER_STATUS.OPEN
      )

    test('applies inputOverride and outputOverrides', () => {
      const response = order().toGetResponse()

      expect(response.effectiveInput).toEqual({
        token: Tokens.MAINNET.USDC,
        startAmount: '1500000',
        endAmount: '2000000',
      })
      expect(response.effectiveOutputs?.map((o) => o.startAmount)).toEqual([
        '1100000000000000000',
        '1000000000000000',
      ])
      expect(response.effectiveOutputs?.map((o) => o.endAmount)).toEqual(['900000000000000000', '900000000000000'])
    })

    test('falls back to the signed amounts when an override is zero', () => {
      const inner = order().inner
      inner.info.cosignerData.inputOverride = BigNumber.from(0)
      inner.info.cosignerData.outputOverrides = [BigNumber.from(0), BigNumber.from(0)]
      const response = new DutchV2Order(inner, MOCK_SIGNATURE, ChainId.MAINNET, ORDER_STATUS.OPEN).toGetResponse()

      expect(response.effectiveInput?.startAmount).toEqual(inner.info.input.startAmount.toString())
      expect(response.effectiveOutputs?.map((o) => o.startAmount)).toEqual(
        inner.info.outputs.map((o) => o.startAmount.toString())
      )
    })

    test('leaves the signed input and outputs untouched', () => {
      const response = order().toGetResponse()

      expect(response.input.startAmount).toEqual('2000000')
      expect(response.outputs.map((o) => o.startAmount)).toEqual(['1000000000000000000', '1000000000000000'])
    })
  })
})
