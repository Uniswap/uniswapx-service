import { getAddress } from '@ethersproject/address'
import { BigNumber } from 'ethers'
import { toOrderEntity } from '../../../../lib/core/orders/storedRow'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../../lib/entities'
import { toPriorityResponse, toV2Response, toV3Response } from '../../../../lib/handlers/get-orders/toResponse'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../../lib/models/DutchV3Order'
import { PriorityOrder } from '../../../../lib/models/PriorityOrder'
import { ChainId } from '../../../../lib/util/chain'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../../factories/SDKPriorityOrderFactory'
import { MOCK_SIGNATURE } from '../../../test-data'
import { Tokens } from '../../fixtures'

// Synthetic mixed-case addresses: the row stores them lowercased, the response checksums them.
const SWAPPER = getAddress(`0x${'ab'.repeat(20)}`)
const RECIPIENT = getAddress(`0x${'cd'.repeat(20)}`)
const QUOTE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const REQUEST_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

// A filled row: status and fill details exist only on the row, never on the encoded order.
const FILL = {
  orderStatus: ORDER_STATUS.FILLED,
  txHash: `0x${'12'.repeat(32)}`,
  fillBlock: 42,
  fillTimestamp: 1_700_000_000,
  settledAmounts: [
    { tokenOut: Tokens.MAINNET.WETH, amountOut: '1000', tokenIn: Tokens.MAINNET.USDC, amountIn: '2000' },
  ],
  createdAt: 1_699_999_000,
}

function filled(entity: UniswapXOrderEntity): UniswapXOrderEntity {
  return { ...entity, ...FILL }
}

const HEAD_KEYS = [
  'type',
  'orderStatus',
  'signature',
  'encodedOrder',
  'chainId',
  'nonce',
  'txHash',
  'fillBlock',
  'fillTimestamp',
  'orderHash',
  'swapper',
  'reactor',
  'deadline',
]
const TAIL_KEYS = ['cosignature', 'quoteId', 'requestId', 'createdAt']

describe('toV2Response', () => {
  const order = () =>
    new DutchV2Order(
      SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
        swapper: SWAPPER,
        input: { token: Tokens.MAINNET.USDC, startAmount: '2000000', endAmount: '2000000' },
        outputs: [
          {
            token: Tokens.MAINNET.WETH,
            startAmount: '1000000000000000000',
            endAmount: '900000000000000000',
            recipient: RECIPIENT,
          },
          { token: Tokens.MAINNET.WETH, startAmount: '1000000000000000', endAmount: '900000000000000' },
        ],
        cosignerData: {
          inputOverride: '1500000',
          outputOverrides: ['1100000000000000000', '1000000000000000'],
        },
      }),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      QUOTE_ID,
      REQUEST_ID
    )

  test('reads status and fill details off the row and the order off its encodedOrder', () => {
    const { inner } = order()
    const entity = filled(toOrderEntity(order()))
    const response = toV2Response(entity)

    expect(response).toEqual({
      type: 'Dutch_V2',
      ...FILL,
      signature: MOCK_SIGNATURE,
      encodedOrder: inner.serialize(),
      chainId: ChainId.MAINNET,
      nonce: inner.info.nonce.toString(),
      orderHash: inner.hash(),
      swapper: SWAPPER,
      reactor: inner.info.reactor,
      deadline: inner.info.deadline,
      input: { token: Tokens.MAINNET.USDC, startAmount: '2000000', endAmount: '2000000' },
      outputs: [
        {
          token: Tokens.MAINNET.WETH,
          startAmount: '1000000000000000000',
          endAmount: '900000000000000000',
          recipient: RECIPIENT,
        },
        {
          token: Tokens.MAINNET.WETH,
          startAmount: '1000000000000000',
          endAmount: '900000000000000',
          recipient: inner.info.outputs[1].recipient,
        },
      ],
      effectiveInput: { token: Tokens.MAINNET.USDC, startAmount: '1500000', endAmount: '2000000' },
      effectiveOutputs: [
        {
          token: Tokens.MAINNET.WETH,
          startAmount: '1100000000000000000',
          endAmount: '900000000000000000',
          recipient: RECIPIENT,
        },
        {
          token: Tokens.MAINNET.WETH,
          startAmount: '1000000000000000',
          endAmount: '900000000000000',
          recipient: inner.info.outputs[1].recipient,
        },
      ],
      cosignerData: {
        decayStartTime: inner.info.cosignerData.decayStartTime,
        decayEndTime: inner.info.cosignerData.decayEndTime,
        exclusiveFiller: inner.info.cosignerData.exclusiveFiller,
        inputOverride: '1500000',
        outputOverrides: ['1100000000000000000', '1000000000000000'],
      },
      cosignature: inner.info.cosignature,
      quoteId: QUOTE_ID,
      requestId: REQUEST_ID,
    })
    expect(entity.outputs[0].recipient).toEqual(RECIPIENT.toLowerCase())
    expect(Object.keys(response)).toEqual([
      ...HEAD_KEYS,
      'input',
      'outputs',
      'effectiveInput',
      'effectiveOutputs',
      'settledAmounts',
      'cosignerData',
      ...TAIL_KEYS,
    ])
  })

  test('falls back to the signed amounts when an override is zero', () => {
    const { inner } = order()
    inner.info.cosignerData.inputOverride = BigNumber.from(0)
    inner.info.cosignerData.outputOverrides = [BigNumber.from(0), BigNumber.from(0)]
    const response = toV2Response(toOrderEntity(new DutchV2Order(inner, MOCK_SIGNATURE, ChainId.MAINNET)))

    expect(response.effectiveInput).toEqual(response.input)
    expect(response.effectiveOutputs).toEqual(response.outputs)
  })

  test('falls back to the signed amount for an output without an override', () => {
    const { inner } = order()
    inner.info.cosignerData.outputOverrides = [BigNumber.from('1100000000000000000')]
    const response = toV2Response(toOrderEntity(new DutchV2Order(inner, MOCK_SIGNATURE, ChainId.MAINNET)))

    expect(response.effectiveOutputs?.map((o) => o.startAmount)).toEqual(['1100000000000000000', '1000000000000000'])
  })
})

describe('toV3Response', () => {
  const order = (inputOverride = '1500000', outputOverrides = [BigInt('1100000000000000000'), BigInt(0)]) =>
    new DutchV3Order(
      SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
        swapper: SWAPPER,
        startingBaseFee: '9',
        input: {
          token: Tokens.ARBITRUM_ONE.USDC,
          startAmount: '2000000',
          curve: { relativeBlocks: [1, 2], relativeAmounts: [BigInt(10), BigInt(20)] },
          maxAmount: '2100000',
          adjustmentPerGweiBaseFee: '3',
        },
        outputs: [
          {
            token: Tokens.ARBITRUM_ONE.WETH,
            startAmount: '1000000000000000000',
            curve: { relativeBlocks: [4], relativeAmounts: [BigInt(5)] },
            minAmount: '900000000000000000',
            adjustmentPerGweiBaseFee: '7',
            recipient: RECIPIENT,
          },
          { token: Tokens.ARBITRUM_ONE.WETH, startAmount: '1000000000000000', minAmount: '900000000000000' },
        ],
        cosignerData: { inputOverride, outputOverrides },
      }),
      MOCK_SIGNATURE,
      ChainId.ARBITRUM_ONE,
      QUOTE_ID,
      REQUEST_ID
    )

  test('reads status and fill details off the row and the order off its encodedOrder', () => {
    const { inner } = order()
    const response = toV3Response(filled(toOrderEntity(order())))
    const input = (startAmount: string) => ({
      token: Tokens.ARBITRUM_ONE.USDC,
      startAmount,
      curve: { relativeBlocks: [1, 2], relativeAmounts: ['10', '20'] },
      maxAmount: '2100000',
      adjustmentPerGweiBaseFee: '3',
    })
    const outputs = (startAmounts: string[]) => [
      {
        token: Tokens.ARBITRUM_ONE.WETH,
        startAmount: startAmounts[0],
        curve: { relativeBlocks: [4], relativeAmounts: ['5'] },
        minAmount: '900000000000000000',
        recipient: RECIPIENT,
        adjustmentPerGweiBaseFee: '7',
      },
      {
        token: Tokens.ARBITRUM_ONE.WETH,
        startAmount: startAmounts[1],
        curve: { relativeBlocks: [], relativeAmounts: [] },
        minAmount: '900000000000000',
        recipient: inner.info.outputs[1].recipient,
        adjustmentPerGweiBaseFee: '0',
      },
    ]

    expect(response).toEqual({
      type: 'Dutch_V3',
      ...FILL,
      signature: MOCK_SIGNATURE,
      encodedOrder: inner.serialize(),
      chainId: ChainId.ARBITRUM_ONE,
      nonce: inner.info.nonce.toString(),
      orderHash: inner.hash(),
      swapper: SWAPPER,
      reactor: inner.info.reactor,
      deadline: inner.info.deadline,
      startingBaseFee: '9',
      input: input('2000000'),
      outputs: outputs(['1000000000000000000', '1000000000000000']),
      effectiveInput: input('1500000'),
      effectiveOutputs: outputs(['1100000000000000000', '1000000000000000']),
      cosignerData: {
        decayStartBlock: inner.info.cosignerData.decayStartBlock,
        exclusiveFiller: inner.info.cosignerData.exclusiveFiller,
        inputOverride: '1500000',
        outputOverrides: ['1100000000000000000', '0'],
      },
      cosignature: inner.info.cosignature,
      quoteId: QUOTE_ID,
      requestId: REQUEST_ID,
    })
    expect(Object.keys(response)).toEqual([
      ...HEAD_KEYS,
      'startingBaseFee',
      'input',
      'outputs',
      'effectiveInput',
      'effectiveOutputs',
      'settledAmounts',
      'cosignerData',
      ...TAIL_KEYS,
    ])
  })

  test('falls back to the signed amounts when an override is zero', () => {
    const response = toV3Response(toOrderEntity(order('0', [BigInt(0), BigInt(0)])))

    expect(response.effectiveInput).toEqual(response.input)
    expect(response.effectiveOutputs).toEqual(response.outputs)
  })
})

describe('toPriorityResponse', () => {
  const order = () =>
    new PriorityOrder(
      SDKPriorityOrderFactory.buildPriorityOrder(ChainId.MAINNET, {
        swapper: SWAPPER,
        input: { token: Tokens.MAINNET.USDC, amount: '1000000', mpsPerPriorityFeeWei: '0' },
        outputs: [
          {
            token: Tokens.MAINNET.WETH,
            amount: '500000000000000000',
            mpsPerPriorityFeeWei: '7',
            recipient: RECIPIENT,
          },
        ],
      }),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      QUOTE_ID,
      REQUEST_ID
    )

  test('reads status and fill details off the row and the order off its encodedOrder', () => {
    const { inner } = order()
    const response = toPriorityResponse(filled(toOrderEntity(order())))

    expect(response).toEqual({
      type: 'Priority',
      ...FILL,
      signature: MOCK_SIGNATURE,
      encodedOrder: inner.serialize(),
      chainId: ChainId.MAINNET,
      nonce: inner.info.nonce.toString(),
      orderHash: inner.hash(),
      swapper: SWAPPER,
      reactor: inner.info.reactor,
      deadline: inner.info.deadline,
      auctionStartBlock: inner.info.auctionStartBlock.toNumber(),
      baselinePriorityFeeWei: inner.info.baselinePriorityFeeWei.toString(),
      input: { token: Tokens.MAINNET.USDC, amount: '1000000', mpsPerPriorityFeeWei: '0' },
      // The pinned quirk: the output repeats the input's amount and mps, not its own.
      outputs: [{ token: Tokens.MAINNET.WETH, amount: '1000000', mpsPerPriorityFeeWei: '0', recipient: RECIPIENT }],
      cosignerData: { auctionTargetBlock: inner.info.cosignerData.auctionTargetBlock.toNumber() },
      cosignature: inner.info.cosignature,
      quoteId: QUOTE_ID,
      requestId: REQUEST_ID,
    })
    expect(Object.keys(response)).toEqual([
      ...HEAD_KEYS,
      'auctionStartBlock',
      'baselinePriorityFeeWei',
      'input',
      'outputs',
      'settledAmounts',
      'cosignerData',
      ...TAIL_KEYS,
    ])
  })
})

describe('an open row', () => {
  test.each([
    [
      'Dutch_V2',
      () =>
        toV2Response(
          toOrderEntity(new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), MOCK_SIGNATURE, ChainId.MAINNET))
        ),
    ],
    [
      'Dutch_V3',
      () =>
        toV3Response(
          toOrderEntity(
            new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(), MOCK_SIGNATURE, ChainId.ARBITRUM_ONE)
          )
        ),
    ],
    [
      'Priority',
      () =>
        toPriorityResponse(
          toOrderEntity(
            new PriorityOrder(SDKPriorityOrderFactory.buildPriorityOrder(), MOCK_SIGNATURE, ChainId.MAINNET)
          )
        ),
    ],
  ])('serializes a %s order without fill details', (_type, response) => {
    const body = JSON.parse(JSON.stringify(response()))
    expect(body.orderStatus).toEqual(ORDER_STATUS.OPEN)
    for (const key of ['txHash', 'fillBlock', 'fillTimestamp', 'settledAmounts', 'quoteId', 'requestId', 'createdAt']) {
      expect(body).not.toHaveProperty(key)
    }
  })
})
