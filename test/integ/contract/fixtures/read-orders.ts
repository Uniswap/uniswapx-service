import { COSIGNATURE, Orders, QUOTE_ID, REQUEST_ID, SIGNATURE, Swappers } from './orders'

// What GET /orders, GET /limit-orders and GET /nonce return today for the rows below. The rows are
// the raw DynamoDB items (as the post path and the order tracker write them) of the reader swapper,
// seeded directly so the reads do not depend on the write path.

export const SeededRows = {
  Orders: {
    readV2Open: {
      _ct: '2100-01-01T00:00:01.000Z',
      _et: 'Order',
      _md: '2100-01-01T00:00:01.000Z',
      chainId: 1,
      chainId_filler: '1_0x1111111111111111111111111111111111111111',
      chainId_orderStatus: '1_open',
      chainId_orderStatus_filler: '1_open_0x1111111111111111111111111111111111111111',
      cosignature: COSIGNATURE,
      cosignerData: {
        decayEndTime: 4102444884,
        decayStartTime: 4102444824,
        exclusiveFiller: '0x1111111111111111111111111111111111111111',
        inputOverride: '999000',
        outputOverrides: ['2050000000000000000', '0'],
      },
      createdAt: 4102444801,
      deadline: 4102444920,
      decayEndTime: 4102444920,
      decayStartTime: 4102444824,
      encodedOrder: Orders.readV2Open.encodedOrder,
      filler: '0x1111111111111111111111111111111111111111',
      filler_offerer: '0x1111111111111111111111111111111111111111_0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      filler_offerer_orderStatus:
        '0x1111111111111111111111111111111111111111_0x90f79bf6eb2c4f870365e785982e1f101e93b906_open',
      filler_orderStatus: '0x1111111111111111111111111111111111111111_open',
      input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      nonce: '2001',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      offerer_orderStatus: '0x90f79bf6eb2c4f870365e785982e1f101e93b906_open',
      orderHash: Orders.readV2Open.orderHash,
      orderStatus: 'open',
      outputs: [
        {
          endAmount: '1900000000000000000',
          recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          startAmount: '2000000000000000000',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
        {
          endAmount: '95000000000000',
          recipient: '0x000000000000000000000000000000000000fee0',
          startAmount: '99999999999999',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0x00000011f84b9aa48e5f8aa8b9897600006289be',
      requestId: REQUEST_ID,
      signature: SIGNATURE,
      type: 'Dutch_V2',
    },
    readV2Filled: {
      _ct: '2100-01-01T00:00:02.000Z',
      _et: 'Order',
      _md: '2100-01-01T00:00:30.000Z',
      chainId: 1,
      chainId_filler: '1_0x1111111111111111111111111111111111111111',
      chainId_orderStatus: '1_filled',
      chainId_orderStatus_filler: '1_filled_0x1111111111111111111111111111111111111111',
      cosignature: COSIGNATURE,
      cosignerData: {
        decayEndTime: 4102444884,
        decayStartTime: 4102444824,
        exclusiveFiller: '0x1111111111111111111111111111111111111111',
        inputOverride: '0',
        outputOverrides: ['0', '0'],
      },
      createdAt: 4102444802,
      deadline: 4102444920,
      decayEndTime: 4102444920,
      decayStartTime: 4102444824,
      encodedOrder: Orders.readV2Filled.encodedOrder,
      fillBlock: 21000000,
      fillTimestamp: 4102444830,
      filler: '0x1111111111111111111111111111111111111111',
      filler_offerer: '0x1111111111111111111111111111111111111111_0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      filler_offerer_orderStatus:
        '0x1111111111111111111111111111111111111111_0x90f79bf6eb2c4f870365e785982e1f101e93b906_filled',
      filler_orderStatus: '0x1111111111111111111111111111111111111111_filled',
      input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      nonce: '2002',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      offerer_orderStatus: '0x90f79bf6eb2c4f870365e785982e1f101e93b906_filled',
      orderHash: Orders.readV2Filled.orderHash,
      orderStatus: 'filled',
      outputs: [
        {
          endAmount: '1900000000000000000',
          recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          startAmount: '2000000000000000000',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
        {
          endAmount: '95000000000000',
          recipient: '0x000000000000000000000000000000000000fee0',
          startAmount: '99999999999999',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0x00000011f84b9aa48e5f8aa8b9897600006289be',
      requestId: REQUEST_ID,
      settledAmounts: [
        {
          amountIn: '1000000',
          amountOut: '1950000000000000000',
          tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
      ],
      signature: SIGNATURE,
      txHash: '0xabababababababababababababababababababababababababababababababab',
      type: 'Dutch_V2',
    },
    readV3: {
      _ct: '2100-01-01T00:00:03.000Z',
      _et: 'Order',
      _md: '2100-01-01T00:00:03.000Z',
      chainId: 42161,
      chainId_filler: '42161_0x1111111111111111111111111111111111111111',
      chainId_orderStatus: '42161_open',
      chainId_orderStatus_filler: '42161_open_0x1111111111111111111111111111111111111111',
      cosignature: COSIGNATURE,
      cosignerData: {
        decayStartBlock: 1000,
        exclusiveFiller: '0x1111111111111111111111111111111111111111',
        inputOverride: '0',
        outputOverrides: ['2050000000000000000', '0'],
      },
      createdAt: 4102444803,
      deadline: 4102444920,
      encodedOrder: Orders.readV3.encodedOrder,
      filler: '0x1111111111111111111111111111111111111111',
      filler_offerer: '0x1111111111111111111111111111111111111111_0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      filler_offerer_orderStatus:
        '0x1111111111111111111111111111111111111111_0x90f79bf6eb2c4f870365e785982e1f101e93b906_open',
      filler_orderStatus: '0x1111111111111111111111111111111111111111_open',
      input: {
        adjustmentPerGweiBaseFee: '0',
        curve: { relativeAmounts: [], relativeBlocks: [] },
        maxAmount: '1000000',
        startAmount: '1000000',
        token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      },
      nonce: '2003',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      offerer_orderStatus: '0x90f79bf6eb2c4f870365e785982e1f101e93b906_open',
      orderHash: Orders.readV3.orderHash,
      orderStatus: 'open',
      outputs: [
        {
          adjustmentPerGweiBaseFee: '0',
          curve: { relativeAmounts: ['100000000000000000'], relativeBlocks: [10] },
          minAmount: '1900000000000000000',
          recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          startAmount: '2000000000000000000',
          token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        },
        {
          adjustmentPerGweiBaseFee: '0',
          curve: { relativeAmounts: ['4999999999999'], relativeBlocks: [10] },
          minAmount: '95000000000000',
          recipient: '0x000000000000000000000000000000000000fee0',
          startAmount: '99999999999999',
          token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0xb274d5f4b833b61b340b654d600a864fb604a87c',
      requestId: REQUEST_ID,
      signature: SIGNATURE,
      startingBaseFee: '0',
      type: 'Dutch_V3',
    },
    readPriority: {
      _ct: '2100-01-01T00:00:04.000Z',
      _et: 'Order',
      _md: '2100-01-01T00:00:31.000Z',
      auctionStartBlock: 105,
      baselinePriorityFeeWei: '0',
      chainId: 8453,
      chainId_filler: '8453_undefined',
      chainId_orderStatus: '8453_filled',
      chainId_orderStatus_filler: '8453_filled_undefined',
      cosignature: COSIGNATURE,
      cosignerData: { auctionTargetBlock: 103 },
      createdAt: 4102444804,
      deadline: 4102444920,
      encodedOrder: Orders.readPriority.encodedOrder,
      fillBlock: 105,
      fillTimestamp: 4102444810,
      filler_offerer: 'undefined_0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      filler_offerer_orderStatus: 'undefined_0x90f79bf6eb2c4f870365e785982e1f101e93b906_filled',
      filler_orderStatus: 'undefined_filled',
      input: { amount: '1000000', mpsPerPriorityFeeWei: '0', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
      nonce: '2004',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      offerer_orderStatus: '0x90f79bf6eb2c4f870365e785982e1f101e93b906_filled',
      orderHash: Orders.readPriority.orderHash,
      orderStatus: 'filled',
      outputs: [
        {
          amount: '2000000000000000000',
          mpsPerPriorityFeeWei: '1',
          recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          token: '0x4200000000000000000000000000000000000006',
        },
        {
          amount: '99999999999999',
          mpsPerPriorityFeeWei: '1',
          recipient: '0x000000000000000000000000000000000000fee0',
          token: '0x4200000000000000000000000000000000000006',
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0x000000001ec5656dcdb24d90dfa42742738de729',
      requestId: REQUEST_ID,
      settledAmounts: [
        {
          amountIn: '1000000',
          amountOut: '2000000000000000000',
          tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          tokenOut: '0x4200000000000000000000000000000000000006',
        },
      ],
      signature: SIGNATURE,
      txHash: '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
      type: 'Priority',
    },
    readDutchV1: {
      _ct: '2100-01-01T00:00:05.000Z',
      _et: 'Order',
      _md: '2100-01-01T00:00:32.000Z',
      chainId: 1,
      chainId_filler: '1_0x0000000000000000000000000000000000000000',
      chainId_orderStatus: '1_expired',
      chainId_orderStatus_filler: '1_expired_0x0000000000000000000000000000000000000000',
      createdAt: 4102444805,
      deadline: 4102448400,
      decayEndTime: 4102448400,
      decayStartTime: 4102444800,
      encodedOrder: Orders.readDutchV1.encodedOrder,
      filler: '0x0000000000000000000000000000000000000000',
      filler_offerer: '0x0000000000000000000000000000000000000000_0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      filler_offerer_orderStatus:
        '0x0000000000000000000000000000000000000000_0x90f79bf6eb2c4f870365e785982e1f101e93b906_expired',
      filler_orderStatus: '0x0000000000000000000000000000000000000000_expired',
      input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      nonce: '2006',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      offerer_orderStatus: '0x90f79bf6eb2c4f870365e785982e1f101e93b906_expired',
      orderHash: Orders.readDutchV1.orderHash,
      orderStatus: 'expired',
      outputs: [
        {
          endAmount: '1900000000000000000',
          recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          startAmount: '2000000000000000000',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
        {
          endAmount: '99999999999999',
          recipient: '0x000000000000000000000000000000000000fee0',
          startAmount: '99999999999999',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0x6000da47483062a0d734ba3dc7576ce6a0b645c4',
      signature: SIGNATURE,
      type: 'Dutch',
    },
  },
  LimitOrders: {
    readLimit: {
      _ct: '2100-01-01T00:00:06.000Z',
      _et: 'LimitOrder',
      _md: '2100-01-01T00:00:06.000Z',
      chainId: 1,
      chainId_filler: '1_0x0000000000000000000000000000000000000000',
      chainId_orderStatus: '1_open',
      chainId_orderStatus_filler: '1_open_0x0000000000000000000000000000000000000000',
      createdAt: 4102444806,
      deadline: 4102448400,
      decayEndTime: 4102448400,
      decayStartTime: 4102444800,
      encodedOrder: Orders.readLimit.encodedOrder,
      filler: '0x0000000000000000000000000000000000000000',
      filler_offerer: '0x0000000000000000000000000000000000000000_0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      filler_offerer_orderStatus:
        '0x0000000000000000000000000000000000000000_0x90f79bf6eb2c4f870365e785982e1f101e93b906_open',
      filler_orderStatus: '0x0000000000000000000000000000000000000000_open',
      input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      nonce: '2005',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      offerer_orderStatus: '0x90f79bf6eb2c4f870365e785982e1f101e93b906_open',
      orderHash: Orders.readLimit.orderHash,
      orderStatus: 'open',
      outputs: [
        {
          endAmount: '2000000000000000000',
          recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          startAmount: '2000000000000000000',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
        {
          endAmount: '99999999999999',
          recipient: '0x000000000000000000000000000000000000fee0',
          startAmount: '99999999999999',
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0x6000da47483062a0d734ba3dc7576ce6a0b645c4',
      signature: SIGNATURE,
      type: 'Dutch',
    },
  },
  Nonces: [
    {
      _ct: '2100-01-01T00:00:01.000Z',
      _et: 'Nonce',
      _md: '2100-01-01T00:00:06.000Z',
      nonce: '2005',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906-1',
    },
    {
      _ct: '2100-01-01T00:00:04.000Z',
      _et: 'Nonce',
      _md: '2100-01-01T00:00:04.000Z',
      nonce: '2004',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906-8453',
    },
    {
      _ct: '2100-01-01T00:00:03.000Z',
      _et: 'Nonce',
      _md: '2100-01-01T00:00:03.000Z',
      nonce: '2003',
      offerer: '0x90f79bf6eb2c4f870365e785982e1f101e93b906-42161',
    },
  ],
}

// How each seeded row comes back, by response shape:
// - Typed: built from the encoded order (orderType given).
// - Legacy: the stored row with offerer renamed to swapper, so lowercased (no orderType, and the
//   orderType Dutch, Dutch_V1_V2 and Limit paths, which return stored rows).
const DutchV1Legacy = {
  outputs: [
    {
      recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      startAmount: '2000000000000000000',
      endAmount: '1900000000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    {
      recipient: '0x000000000000000000000000000000000000fee0',
      startAmount: '99999999999999',
      endAmount: '99999999999999',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  ],
  signature: SIGNATURE,
  orderStatus: 'expired',
  encodedOrder: Orders.readDutchV1.encodedOrder,
  type: 'Dutch',
  createdAt: 4102444805,
  orderHash: Orders.readDutchV1.orderHash,
  nonce: '2006',
  quoteId: QUOTE_ID,
  input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  chainId: 1,
  swapper: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
}
const PriorityLegacy = {
  outputs: [
    {
      recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      amount: '2000000000000000000',
      mpsPerPriorityFeeWei: '1',
      token: '0x4200000000000000000000000000000000000006',
    },
    {
      recipient: '0x000000000000000000000000000000000000fee0',
      amount: '99999999999999',
      mpsPerPriorityFeeWei: '1',
      token: '0x4200000000000000000000000000000000000006',
    },
  ],
  signature: SIGNATURE,
  orderStatus: 'filled',
  cosignature: COSIGNATURE,
  encodedOrder: Orders.readPriority.encodedOrder,
  type: 'Priority',
  settledAmounts: [
    {
      tokenOut: '0x4200000000000000000000000000000000000006',
      amountIn: '1000000',
      amountOut: '2000000000000000000',
      tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  ],
  fillTimestamp: 4102444810,
  createdAt: 4102444804,
  cosignerData: { auctionTargetBlock: 103 },
  baselinePriorityFeeWei: '0',
  requestId: REQUEST_ID,
  txHash: '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
  orderHash: Orders.readPriority.orderHash,
  fillBlock: 105,
  nonce: '2004',
  quoteId: QUOTE_ID,
  input: { mpsPerPriorityFeeWei: '0', amount: '1000000', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  auctionStartBlock: 105,
  chainId: 8453,
  swapper: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
}
const V3Legacy = {
  outputs: [
    {
      recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      minAmount: '1900000000000000000',
      startAmount: '2000000000000000000',
      curve: { relativeAmounts: ['100000000000000000'], relativeBlocks: [10] },
      adjustmentPerGweiBaseFee: '0',
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
    {
      recipient: '0x000000000000000000000000000000000000fee0',
      minAmount: '95000000000000',
      startAmount: '99999999999999',
      curve: { relativeAmounts: ['4999999999999'], relativeBlocks: [10] },
      adjustmentPerGweiBaseFee: '0',
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
  ],
  signature: SIGNATURE,
  orderStatus: 'open',
  cosignature: COSIGNATURE,
  encodedOrder: Orders.readV3.encodedOrder,
  type: 'Dutch_V3',
  createdAt: 4102444803,
  cosignerData: {
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    inputOverride: '0',
    outputOverrides: ['2050000000000000000', '0'],
    decayStartBlock: 1000,
  },
  requestId: REQUEST_ID,
  orderHash: Orders.readV3.orderHash,
  startingBaseFee: '0',
  nonce: '2003',
  quoteId: QUOTE_ID,
  input: {
    startAmount: '1000000',
    maxAmount: '1000000',
    curve: { relativeAmounts: [], relativeBlocks: [] },
    adjustmentPerGweiBaseFee: '0',
    token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  chainId: 42161,
  swapper: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
}
const V2FilledLegacy = {
  outputs: [
    {
      recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      startAmount: '2000000000000000000',
      endAmount: '1900000000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    {
      recipient: '0x000000000000000000000000000000000000fee0',
      startAmount: '99999999999999',
      endAmount: '95000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  ],
  signature: SIGNATURE,
  orderStatus: 'filled',
  cosignature: COSIGNATURE,
  encodedOrder: Orders.readV2Filled.encodedOrder,
  type: 'Dutch_V2',
  settledAmounts: [
    {
      tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      amountIn: '1000000',
      amountOut: '1950000000000000000',
      tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  ],
  fillTimestamp: 4102444830,
  createdAt: 4102444802,
  cosignerData: {
    decayEndTime: 4102444884,
    decayStartTime: 4102444824,
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    inputOverride: '0',
    outputOverrides: ['0', '0'],
  },
  requestId: REQUEST_ID,
  txHash: '0xabababababababababababababababababababababababababababababababab',
  orderHash: Orders.readV2Filled.orderHash,
  fillBlock: 21000000,
  nonce: '2002',
  quoteId: QUOTE_ID,
  input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  chainId: 1,
  swapper: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
}
const V2OpenLegacy = {
  outputs: [
    {
      recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      startAmount: '2000000000000000000',
      endAmount: '1900000000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    {
      recipient: '0x000000000000000000000000000000000000fee0',
      startAmount: '99999999999999',
      endAmount: '95000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  ],
  signature: SIGNATURE,
  orderStatus: 'open',
  cosignature: COSIGNATURE,
  encodedOrder: Orders.readV2Open.encodedOrder,
  type: 'Dutch_V2',
  createdAt: 4102444801,
  cosignerData: {
    decayEndTime: 4102444884,
    decayStartTime: 4102444824,
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    inputOverride: '999000',
    outputOverrides: ['2050000000000000000', '0'],
  },
  requestId: REQUEST_ID,
  orderHash: Orders.readV2Open.orderHash,
  nonce: '2001',
  quoteId: QUOTE_ID,
  input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  chainId: 1,
  swapper: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
}
const V2FilledTyped = {
  type: 'Dutch_V2',
  orderStatus: 'filled',
  signature: SIGNATURE,
  encodedOrder: Orders.readV2Filled.encodedOrder,
  chainId: 1,
  nonce: '2002',
  txHash: '0xabababababababababababababababababababababababababababababababab',
  fillBlock: 21000000,
  fillTimestamp: 4102444830,
  orderHash: Orders.readV2Filled.orderHash,
  swapper: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  input: { token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', startAmount: '1000000', endAmount: '1000000' },
  outputs: [
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '2000000000000000000',
      endAmount: '1900000000000000000',
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    },
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '99999999999999',
      endAmount: '95000000000000',
      recipient: '0x000000000000000000000000000000000000FEE0',
    },
  ],
  effectiveInput: { token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', startAmount: '1000000', endAmount: '1000000' },
  effectiveOutputs: [
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '2000000000000000000',
      endAmount: '1900000000000000000',
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    },
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '99999999999999',
      endAmount: '95000000000000',
      recipient: '0x000000000000000000000000000000000000FEE0',
    },
  ],
  settledAmounts: [
    {
      tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      amountIn: '1000000',
      amountOut: '1950000000000000000',
      tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  ],
  cosignerData: {
    decayStartTime: 4102444824,
    decayEndTime: 4102444884,
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    inputOverride: '0',
    outputOverrides: ['0', '0'],
  },
  cosignature: COSIGNATURE,
  quoteId: QUOTE_ID,
  requestId: REQUEST_ID,
  createdAt: 4102444802,
}
const V2OpenTyped = {
  type: 'Dutch_V2',
  orderStatus: 'open',
  signature: SIGNATURE,
  encodedOrder: Orders.readV2Open.encodedOrder,
  chainId: 1,
  nonce: '2001',
  orderHash: Orders.readV2Open.orderHash,
  swapper: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  input: { token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', startAmount: '1000000', endAmount: '1000000' },
  outputs: [
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '2000000000000000000',
      endAmount: '1900000000000000000',
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    },
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '99999999999999',
      endAmount: '95000000000000',
      recipient: '0x000000000000000000000000000000000000FEE0',
    },
  ],
  effectiveInput: { token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', startAmount: '999000', endAmount: '1000000' },
  effectiveOutputs: [
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '2050000000000000000',
      endAmount: '1900000000000000000',
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    },
    {
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      startAmount: '99999999999999',
      endAmount: '95000000000000',
      recipient: '0x000000000000000000000000000000000000FEE0',
    },
  ],
  cosignerData: {
    decayStartTime: 4102444824,
    decayEndTime: 4102444884,
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    inputOverride: '999000',
    outputOverrides: ['2050000000000000000', '0'],
  },
  cosignature: COSIGNATURE,
  quoteId: QUOTE_ID,
  requestId: REQUEST_ID,
  createdAt: 4102444801,
}
const V3Typed = {
  type: 'Dutch_V3',
  orderStatus: 'open',
  signature: SIGNATURE,
  encodedOrder: Orders.readV3.encodedOrder,
  chainId: 42161,
  nonce: '2003',
  orderHash: Orders.readV3.orderHash,
  swapper: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  startingBaseFee: '0',
  input: {
    token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    startAmount: '1000000',
    curve: { relativeBlocks: [], relativeAmounts: [] },
    maxAmount: '1000000',
    adjustmentPerGweiBaseFee: '0',
  },
  outputs: [
    {
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      startAmount: '2000000000000000000',
      curve: { relativeBlocks: [10], relativeAmounts: ['100000000000000000'] },
      minAmount: '1900000000000000000',
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      adjustmentPerGweiBaseFee: '0',
    },
    {
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      startAmount: '99999999999999',
      curve: { relativeBlocks: [10], relativeAmounts: ['4999999999999'] },
      minAmount: '95000000000000',
      recipient: '0x000000000000000000000000000000000000FEE0',
      adjustmentPerGweiBaseFee: '0',
    },
  ],
  effectiveInput: {
    token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    startAmount: '1000000',
    curve: { relativeBlocks: [], relativeAmounts: [] },
    maxAmount: '1000000',
    adjustmentPerGweiBaseFee: '0',
  },
  effectiveOutputs: [
    {
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      startAmount: '2050000000000000000',
      curve: { relativeBlocks: [10], relativeAmounts: ['100000000000000000'] },
      minAmount: '1900000000000000000',
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      adjustmentPerGweiBaseFee: '0',
    },
    {
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      startAmount: '99999999999999',
      curve: { relativeBlocks: [10], relativeAmounts: ['4999999999999'] },
      minAmount: '95000000000000',
      recipient: '0x000000000000000000000000000000000000FEE0',
      adjustmentPerGweiBaseFee: '0',
    },
  ],
  cosignerData: {
    decayStartBlock: 1000,
    exclusiveFiller: '0x1111111111111111111111111111111111111111',
    inputOverride: '0',
    outputOverrides: ['2050000000000000000', '0'],
  },
  cosignature: COSIGNATURE,
  quoteId: QUOTE_ID,
  requestId: REQUEST_ID,
  createdAt: 4102444803,
}
const PriorityTyped = {
  type: 'Priority',
  orderStatus: 'filled',
  signature: SIGNATURE,
  encodedOrder: Orders.readPriority.encodedOrder,
  chainId: 8453,
  nonce: '2004',
  txHash: '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
  fillBlock: 105,
  fillTimestamp: 4102444810,
  orderHash: Orders.readPriority.orderHash,
  swapper: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  auctionStartBlock: 105,
  baselinePriorityFeeWei: '0',
  input: { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000000', mpsPerPriorityFeeWei: '0' },
  // every output repeats the input amount and mps (PriorityOrder.toGetResponse); deliberate, for parity
  outputs: [
    {
      token: '0x4200000000000000000000000000000000000006',
      amount: '1000000',
      mpsPerPriorityFeeWei: '0',
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    },
    {
      token: '0x4200000000000000000000000000000000000006',
      amount: '1000000',
      mpsPerPriorityFeeWei: '0',
      recipient: '0x000000000000000000000000000000000000FEE0',
    },
  ],
  settledAmounts: [
    {
      tokenOut: '0x4200000000000000000000000000000000000006',
      amountIn: '1000000',
      amountOut: '2000000000000000000',
      tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  ],
  cosignerData: { auctionTargetBlock: 103 },
  cosignature: COSIGNATURE,
  quoteId: QUOTE_ID,
  requestId: REQUEST_ID,
  createdAt: 4102444804,
}
const LimitLegacy = {
  outputs: [
    {
      recipient: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      startAmount: '2000000000000000000',
      endAmount: '2000000000000000000',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    {
      recipient: '0x000000000000000000000000000000000000fee0',
      startAmount: '99999999999999',
      endAmount: '99999999999999',
      token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  ],
  signature: SIGNATURE,
  orderStatus: 'open',
  encodedOrder: Orders.readLimit.encodedOrder,
  type: 'Dutch',
  createdAt: 4102444806,
  orderHash: Orders.readLimit.orderHash,
  nonce: '2005',
  quoteId: QUOTE_ID,
  input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  chainId: 1,
  swapper: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
}

const reader = Swappers.reader

export const GetOrdersReads = {
  bySwapper: {
    query: { swapper: reader },
    expected: {
      statusCode: 200,
      body: { orders: [DutchV1Legacy, PriorityLegacy, V3Legacy, V2FilledLegacy, V2OpenLegacy] },
    },
  },
  bySwapperDutchV2: {
    query: { swapper: reader, orderType: 'Dutch_V2' },
    expected: { statusCode: 200, body: { orders: [V2FilledTyped, V2OpenTyped] } },
  },
  bySwapperDutchV3: {
    query: { swapper: reader, orderType: 'Dutch_V3' },
    expected: { statusCode: 200, body: { orders: [V3Typed] } },
  },
  bySwapperPriority: {
    query: { swapper: reader, orderType: 'Priority' },
    expected: { statusCode: 200, body: { orders: [PriorityTyped] } },
  },
  bySwapperDutch: {
    query: { swapper: reader, orderType: 'Dutch' },
    expected: { statusCode: 200, body: { orders: [DutchV1Legacy] } },
  },
  bySwapperDutchV1V2: {
    query: { swapper: reader, orderType: 'Dutch_V1_V2' },
    expected: { statusCode: 200, body: { orders: [DutchV1Legacy, V2FilledTyped, V2OpenTyped] } },
  },
  bySwapperLimit: {
    query: { swapper: reader, orderType: 'Limit' },
    expected: { statusCode: 200, body: { orders: [LimitLegacy] } },
  },
  byHash: {
    query: { orderHash: Orders.readV2Open.orderHash },
    expected: { statusCode: 200, body: { orders: [V2OpenLegacy] } },
  },
  byHashDutchV2: {
    query: { orderHash: Orders.readV2Open.orderHash, orderType: 'Dutch_V2' },
    expected: { statusCode: 200, body: { orders: [V2OpenTyped] } },
  },
  byHashes: {
    query: {
      orderHashes: `${Orders.readPriority.orderHash},${Orders.readV2Filled.orderHash},${Orders.readLimit.orderHash}`,
    },
    expected: { statusCode: 200, body: { orders: [PriorityLegacy, V2FilledLegacy] } },
  },
  bySwapperAndChainId: {
    query: { swapper: reader, chainId: '1' },
    expected: {
      statusCode: 400,
      body: {
        detail: 'Querying with both swapper and chainId is not currently supported.',
        errorCode: 'VALIDATION_ERROR',
      },
    },
  },
  withoutFilter: {
    query: { limit: '5' },
    expected: {
      statusCode: 400,
      body: {
        detail:
          '"value" must contain at least one of [orderHash, orderHashes, chainId, orderStatus, swapper, filler, pair]',
        errorCode: 'VALIDATION_ERROR',
      },
    },
  },
  withCursor: {
    query: { swapper: reader, cursor: 'Y3Vyc29y' },
    expected: {
      statusCode: 400,
      body: {
        detail:
          '"cursor" is not supported. GET /orders returns a single page of the newest orders and does not support pagination or other orderings; use GET /limit-orders to page through limit orders.',
        errorCode: 'VALIDATION_ERROR',
      },
    },
  },
  // no query string at all: the handler reaches the repository with no filter; pinned as is
  noQueryString: {
    query: null,
    expected: {
      statusCode: 500,
      body: {
        detail:
          'Invalid query, must query with one of the following params: [orderHash, orderHashes, chainId, orderStatus, swapper, filler, pair]',
        errorCode: 'INTERNAL_ERROR',
        id: 'testRequest',
      },
    },
  },
}

export const GetLimitOrdersReads = {
  bySwapper: { query: { swapper: reader }, expected: { statusCode: 200, body: { orders: [LimitLegacy] } } },
  bySwapperLimit: {
    query: { swapper: reader, orderType: 'Limit' },
    expected: { statusCode: 200, body: { orders: [LimitLegacy] } },
  },
  bySwapperDutch: {
    query: { swapper: reader, orderType: 'Dutch' },
    expected: { statusCode: 200, body: { orders: [LimitLegacy] } },
  },
  bySwapperDutchV2: {
    query: { swapper: reader, orderType: 'Dutch_V2' },
    expected: { statusCode: 200, body: { orders: [] } },
  },
  bySwapperPriority: {
    query: { swapper: reader, orderType: 'Priority' },
    expected: { statusCode: 200, body: { orders: [] } },
  },
  byHash: {
    query: { orderHash: Orders.readLimit.orderHash },
    expected: { statusCode: 200, body: { orders: [LimitLegacy] } },
  },
  // no query string at all: the handler reaches the repository with no filter; pinned as is
  noQueryString: {
    query: null,
    expected: {
      statusCode: 500,
      body: {
        detail:
          'Invalid query, must query with one of the following params: [orderHash, orderHashes, chainId, orderStatus, swapper, filler, pair]',
        errorCode: 'INTERNAL_ERROR',
        id: 'testRequest',
      },
    },
  },
}

// GET /nonce for an address with no Nonces row: a random nonce under this prefix (bits 232 and up).
export const NEVER_SEEN_SWAPPER = '0x000000000000000000000000000000000000dEaD'
export const NEVER_SEEN_NONCE_PREFIX = '0x046832'

export const GetNonceReads = {
  seededSwapper: {
    query: { address: reader },
    expected: {
      statusCode: 200,
      body: { nonce: '2005' },
      onchainNonceChecks: [
        {
          to: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
          data: '0x4fe02b4400000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b9060000000000000000000000000000000000000000000000000000000000000007',
        },
      ],
    },
  },
  seededSwapperOnChain: {
    query: { address: reader, chainId: '8453' },
    expected: {
      statusCode: 200,
      body: { nonce: '2004' },
      onchainNonceChecks: [
        {
          to: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
          data: '0x4fe02b4400000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b9060000000000000000000000000000000000000000000000000000000000000007',
        },
      ],
    },
  },
  unsupportedChainId: {
    query: { address: reader, chainId: '0' },
    expected: {
      statusCode: 400,
      body: {
        detail:
          '"chainId" must be one of [1, 10, 56, 130, 137, 143, 196, 480, 11155111, 1301, 1868, 4217, 8453, 42161, 42220, 43114, 81457, 7777777, 4663, 5042, 57073]',
        errorCode: 'VALIDATION_ERROR',
      },
      onchainNonceChecks: [],
    },
  },
  missingAddress: {
    query: { chainId: '1' },
    expected: {
      statusCode: 400,
      body: { detail: '"address" is required', errorCode: 'VALIDATION_ERROR' },
      onchainNonceChecks: [],
    },
  },
  malformedAddress: {
    query: { address: '0x123' },
    expected: {
      statusCode: 400,
      body: { detail: 'VALIDATION ERROR: Invalid address', errorCode: 'VALIDATION_ERROR' },
      onchainNonceChecks: [],
    },
  },
  // no query string at all: the handler reaches the repository with no filter; pinned as is
  noQueryString: {
    query: null,
    expected: {
      statusCode: 500,
      body: { errorCode: 'INTERNAL_ERROR', detail: 'Unexpected error' },
      onchainNonceChecks: [],
    },
  },
}
