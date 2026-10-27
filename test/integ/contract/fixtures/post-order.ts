import { COSIGNATURE, Orders, QUOTE_ID, REQUEST_ID, SIGNATURE } from './orders'

// What POST /dutch-auction/order and POST /limit/order do today: each case is the request and
// everything it leaves behind. Metrics are compared regardless of emission order.

const DUTCH_ROUTE = '/dutch-auction/order'
const LIMIT_ROUTE = '/limit/order'

function body(order: { chainId: number; encodedOrder: string }, orderType?: string) {
  return {
    encodedOrder: order.encodedOrder,
    signature: SIGNATURE,
    chainId: order.chainId,
    quoteId: QUOTE_ID,
    requestId: REQUEST_ID,
    orderType,
  }
}

// A metric as the request's metrics logger received it: [name, value, unit].
export type MetricCall = [string, number, string | undefined]

// The counters a post request records once it has answered, keyed by the chainId in the raw body.
function requestCounters(chainId: number, statusClass: string): MetricCall[] {
  return [
    [`PostOrderChainId${chainId}Status${statusClass}`, 1, 'Count'],
    ['PostOrderRequest', 1, 'Count'],
    [`PostOrderRequestChainId${chainId}`, 1, 'Count'],
    [`PostOrderStatus${statusClass}`, 1, 'Count'],
  ]
}

// Recorded while parsing a mainnet Dutch_V2 order; these orders' decay starts 24 s after the clock.
const MAINNET_V2_STALENESS: MetricCall[] = [
  ['OrderStaleness-chain-1', 24, undefined],
  ['StaleOrder-chain-1', 1, 'Count'],
]

// The immediate exclusive-filler notice, delivered to the filler's one webhook.
function noticeMetrics(chainId: number): MetricCall[] {
  return [
    [`ImmediateNotificationAttempt-chain-${chainId}`, 1, 'Count'],
    // the clock is frozen
    [`ImmediateNotificationDuration-chain-${chainId}`, 0, 'Milliseconds'],
    [`OrderNotificationAttempt-chain-${chainId}`, 1, undefined],
    [`OrderNotificationSendSuccess-chain-${chainId}`, 1, undefined],
  ]
}

// The priority order as stored: re-encoded with the cosigner data and cosignature the service added.
export const PRIORITY_COSIGNED_ENCODED_ORDER =
  '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000014000000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000000000000000000000690000000000000000000000000000000000000000000000000000000000000000000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000000670000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000001ec5656dcdb24d90dfa42742738de729000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000000003eb00000000000000000000000000000000000000000000000000000000f4865778000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000042000000000000000000000000000000000000060000000000000000000000000000000000000000000000001bc16d674ec800000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000420000000000000000000000000000000000000600000000000000000000000000000000000000000000000000005af3107a3fff0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000fee00000000000000000000000000000000000000000000000000000000000000041f2e1e1aa8584396c5536afbd10f065b13beedbeea678dd0be884bd110a7b4c4425eb5fe7c28ebd2b97b69fb7ebc582f1ea2340961460b0a4ba2b3e71d94006b41c00000000000000000000000000000000000000000000000000000000000000'

export const API_GATEWAY_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Credentials': true,
}

export const AcceptedPosts = {
  Dutch_V2: {
    route: DUTCH_ROUTE,
    request: body(Orders.dutchV2, 'Dutch_V2'),
    table: 'Orders',
    expected: {
      response: { statusCode: 201, body: { hash: Orders.dutchV2.orderHash } },
      storedRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'Order',
        _md: '2100-01-01T00:00:00.000Z',
        chainId: 1,
        chainId_filler: '1_0x1111111111111111111111111111111111111111',
        chainId_orderStatus: '1_open',
        chainId_orderStatus_filler: '1_open_0x1111111111111111111111111111111111111111',
        cosignature: COSIGNATURE,
        cosignerData: {
          decayEndTime: 4102444884,
          decayStartTime: 4102444824,
          exclusiveFiller: '0x1111111111111111111111111111111111111111',
          inputOverride: '0',
          outputOverrides: ['0', '0'],
        },
        createdAt: 4102444800,
        deadline: 4102444920,
        // the deadline, not cosignerData.decayEndTime; deliberate, for parity
        decayEndTime: 4102444920,
        decayStartTime: 4102444824,
        encodedOrder: Orders.dutchV2.encodedOrder,
        filler: '0x1111111111111111111111111111111111111111',
        filler_offerer: '0x1111111111111111111111111111111111111111_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        filler_offerer_orderStatus:
          '0x1111111111111111111111111111111111111111_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        filler_orderStatus: '0x1111111111111111111111111111111111111111_open',
        input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        nonce: '1001',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        offerer_orderStatus: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        orderHash: Orders.dutchV2.orderHash,
        orderStatus: 'open',
        outputs: [
          {
            endAmount: '1900000000000000000',
            recipient: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
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
      nonceRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'Nonce',
        _md: '2100-01-01T00:00:00.000Z',
        nonce: '1001',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266-1',
      },
      startTracking: [
        {
          input: {
            orderHash: Orders.dutchV2.orderHash,
            chainId: 1,
            orderStatus: 'open',
            quoteId: QUOTE_ID,
            orderType: 'Dutch_V2',
            stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-1',
            runIndex: 0,
          },
          stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-1',
        },
      ],
      postedOrderAnalytics: [
        [
          'Analytics Message',
          {
            eventType: 'OrderPosted',
            body: {
              quoteId: QUOTE_ID,
              createdAt: '4102444800',
              orderHash: Orders.dutchV2.orderHash,
              deadline: 4102444920,
              chainId: 1,
              filler: '0x1111111111111111111111111111111111111111',
              tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              orderType: 'Dutch_V2',
              startTime: 4102444824,
              endTime: 4102444920,
              inputStartAmount: '1000000',
              inputEndAmount: '1000000',
              // the string comparison picks the fee output ('99999...' > '2000...'); deliberate, for parity
              outputStartAmount: '99999999999999',
              outputEndAmount: '95000000000000',
            },
          },
        ],
      ],
      exclusiveFillerNotices: [
        [
          'https://filler.example/uniswapx/orders',
          {
            orderHash: Orders.dutchV2.orderHash,
            // milliseconds, where the row and the stream notice carry seconds; deliberate, for parity
            createdAt: 4102444800000,
            signature: SIGNATURE,
            offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            orderStatus: 'open',
            encodedOrder: Orders.dutchV2.encodedOrder,
            chainId: 1,
            type: 'Dutch_V2',
            quoteId: QUOTE_ID,
            filler: '0x1111111111111111111111111111111111111111',
            notifiedAt: 4102444800000,
          },
          { timeout: 200, headers: { 'x-api-key': 'test-key' } },
        ],
      ],
      cosignedDigests: [],
      metrics: [...requestCounters(1, '2XX'), ...MAINNET_V2_STALENESS, ...noticeMetrics(1)],
    },
  },
  Dutch_V3: {
    route: DUTCH_ROUTE,
    request: body(Orders.dutchV3, 'Dutch_V3'),
    table: 'Orders',
    expected: {
      response: { statusCode: 201, body: { hash: Orders.dutchV3.orderHash } },
      storedRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'Order',
        _md: '2100-01-01T00:00:00.000Z',
        chainId: 42161,
        chainId_filler: '42161_0x1111111111111111111111111111111111111111',
        chainId_orderStatus: '42161_open',
        chainId_orderStatus_filler: '42161_open_0x1111111111111111111111111111111111111111',
        cosignature: COSIGNATURE,
        cosignerData: {
          decayStartBlock: 1000,
          exclusiveFiller: '0x1111111111111111111111111111111111111111',
          inputOverride: '0',
          outputOverrides: ['0', '0'],
        },
        createdAt: 4102444800,
        deadline: 4102444920,
        encodedOrder: Orders.dutchV3.encodedOrder,
        filler: '0x1111111111111111111111111111111111111111',
        filler_offerer: '0x1111111111111111111111111111111111111111_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        filler_offerer_orderStatus:
          '0x1111111111111111111111111111111111111111_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        filler_orderStatus: '0x1111111111111111111111111111111111111111_open',
        input: {
          adjustmentPerGweiBaseFee: '0',
          curve: { relativeAmounts: [], relativeBlocks: [] },
          maxAmount: '1000000',
          startAmount: '1000000',
          token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        },
        nonce: '1002',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        offerer_orderStatus: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        orderHash: Orders.dutchV3.orderHash,
        orderStatus: 'open',
        outputs: [
          {
            adjustmentPerGweiBaseFee: '0',
            curve: { relativeAmounts: ['100000000000000000'], relativeBlocks: [10] },
            minAmount: '1900000000000000000',
            recipient: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
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
      nonceRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'Nonce',
        _md: '2100-01-01T00:00:00.000Z',
        nonce: '1002',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266-42161',
      },
      startTracking: [
        {
          input: {
            orderHash: Orders.dutchV3.orderHash,
            chainId: 42161,
            orderStatus: 'open',
            quoteId: QUOTE_ID,
            orderType: 'Dutch_V3',
            stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-42161',
            runIndex: 0,
          },
          stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-42161',
        },
      ],
      postedOrderAnalytics: [
        [
          'Analytics Message',
          {
            eventType: 'OrderPosted',
            body: {
              quoteId: QUOTE_ID,
              createdAt: '4102444800',
              orderHash: Orders.dutchV3.orderHash,
              deadline: 4102444920,
              chainId: 42161,
              filler: '0x1111111111111111111111111111111111111111',
              tokenIn: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
              tokenOut: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
              orderType: 'Dutch_V3',
              startBlock: 1000,
              inputStartAmount: '1000000',
              inputCurve: '{"relativeBlocks":[],"relativeAmounts":[]}',
              // the string comparison picks the fee output ('99999...' > '2000...'); deliberate, for parity
              outputStartAmount: '99999999999999',
              outputCurve: '{"relativeBlocks":[10],"relativeAmounts":["4999999999999"]}',
              startingBaseFee: '0',
            },
          },
        ],
      ],
      exclusiveFillerNotices: [
        [
          'https://filler.example/uniswapx/orders',
          {
            orderHash: Orders.dutchV3.orderHash,
            // milliseconds, where the row and the stream notice carry seconds; deliberate, for parity
            createdAt: 4102444800000,
            signature: SIGNATURE,
            offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            orderStatus: 'open',
            encodedOrder: Orders.dutchV3.encodedOrder,
            chainId: 42161,
            type: 'Dutch_V3',
            quoteId: QUOTE_ID,
            filler: '0x1111111111111111111111111111111111111111',
            notifiedAt: 4102444800000,
          },
          { timeout: 200, headers: { 'x-api-key': 'test-key' } },
        ],
      ],
      cosignedDigests: [],
      metrics: [...requestCounters(42161, '2XX'), ...noticeMetrics(42161)],
    },
  },
  Priority: {
    route: DUTCH_ROUTE,
    request: body(Orders.priority, 'Priority'),
    table: 'Orders',
    expected: {
      response: { statusCode: 201, body: { hash: Orders.priority.orderHash } },
      storedRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'Order',
        _md: '2100-01-01T00:00:00.000Z',
        auctionStartBlock: 105,
        baselinePriorityFeeWei: '0',
        chainId: 8453,
        // priority rows have no filler, so the filler index keys say "undefined"; deliberate, for parity
        chainId_filler: '8453_undefined',
        chainId_orderStatus: '8453_open',
        chainId_orderStatus_filler: '8453_open_undefined',
        cosignature: COSIGNATURE,
        cosignerData: { auctionTargetBlock: 103 },
        createdAt: 4102444800,
        deadline: 4102444920,
        encodedOrder: PRIORITY_COSIGNED_ENCODED_ORDER,
        filler_offerer: 'undefined_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        filler_offerer_orderStatus: 'undefined_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        filler_orderStatus: 'undefined_open',
        input: { amount: '1000000', mpsPerPriorityFeeWei: '0', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
        nonce: '1003',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        offerer_orderStatus: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        orderHash: Orders.priority.orderHash,
        orderStatus: 'open',
        outputs: [
          {
            amount: '2000000000000000000',
            mpsPerPriorityFeeWei: '1',
            recipient: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
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
        signature: SIGNATURE,
        type: 'Priority',
      },
      nonceRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'Nonce',
        _md: '2100-01-01T00:00:00.000Z',
        nonce: '1003',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266-8453',
      },
      startTracking: [
        {
          input: {
            orderHash: Orders.priority.orderHash,
            chainId: 8453,
            orderStatus: 'open',
            quoteId: QUOTE_ID,
            orderType: 'Priority',
            stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-8453',
            runIndex: 0,
          },
          stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-8453',
        },
      ],
      postedOrderAnalytics: [
        [
          'Analytics Message',
          {
            eventType: 'OrderPosted',
            body: {
              quoteId: QUOTE_ID,
              createdAt: '4102444800',
              orderHash: Orders.priority.orderHash,
              deadline: 4102444920,
              chainId: 8453,
              filler: '0x0000000000000000000000000000000000000000',
              tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              tokenOut: '0x4200000000000000000000000000000000000006',
              orderType: 'Priority',
              auctionStartBlock: 105,
              auctionTargetBlock: 103,
              baselinePriorityFeeWei: '0',
              inputStartAmount: '1000000',
              inputEndAmount: '1000000',
              inputMpsPerPriorityFeeWei: '0',
              // the string comparison picks the fee output ('99999...' > '2000...'); deliberate, for parity
              outputStartAmount: '99999999999999',
              outputEndAmount: '99999999999999',
              outputMpsPerPriorityFeeWei: '1',
            },
          },
        ],
      ],
      exclusiveFillerNotices: [],
      cosignedDigests: ['0xe9d6675fe9be59e3e31f7dc250b05a1f89e7b0a22fbf112ece297997834a532d'],
      metrics: [...requestCounters(8453, '2XX')],
    },
  },
  Limit: {
    route: LIMIT_ROUTE,
    request: body(Orders.limit, 'Limit'),
    table: 'LimitOrders',
    expected: {
      response: { statusCode: 201, body: { hash: Orders.limit.orderHash } },
      storedRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'LimitOrder',
        _md: '2100-01-01T00:00:00.000Z',
        chainId: 1,
        chainId_filler: '1_0x0000000000000000000000000000000000000000',
        chainId_orderStatus: '1_open',
        chainId_orderStatus_filler: '1_open_0x0000000000000000000000000000000000000000',
        createdAt: 4102444800,
        deadline: 4102448400,
        decayEndTime: 4102448400,
        decayStartTime: 4102444800,
        encodedOrder: Orders.limit.encodedOrder,
        filler: '0x0000000000000000000000000000000000000000',
        filler_offerer: '0x0000000000000000000000000000000000000000_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        filler_offerer_orderStatus:
          '0x0000000000000000000000000000000000000000_0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        filler_orderStatus: '0x0000000000000000000000000000000000000000_open',
        input: { endAmount: '1000000', startAmount: '1000000', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        nonce: '1004',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        offerer_orderStatus: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266_open',
        orderHash: Orders.limit.orderHash,
        orderStatus: 'open',
        outputs: [
          {
            endAmount: '2000000000000000000',
            recipient: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
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
        // limit orders are stored as Dutch (DAT-313); deliberate, for parity
        type: 'Dutch',
      },
      nonceRow: {
        _ct: '2100-01-01T00:00:00.000Z',
        _et: 'Nonce',
        _md: '2100-01-01T00:00:00.000Z',
        nonce: '1004',
        offerer: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266-1',
      },
      startTracking: [
        {
          input: {
            orderHash: Orders.limit.orderHash,
            chainId: 1,
            orderStatus: 'open',
            quoteId: QUOTE_ID,
            orderType: 'Limit',
            stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-1',
            runIndex: 0,
          },
          stateMachineArn: 'arn:aws:states:us-east-2:123456789012:stateMachine:tracker-1',
        },
      ],
      postedOrderAnalytics: [
        [
          'Analytics Message',
          {
            eventType: 'OrderPosted',
            body: {
              quoteId: QUOTE_ID,
              createdAt: '4102444800',
              orderHash: Orders.limit.orderHash,
              deadline: 4102448400,
              chainId: 1,
              filler: '0x0000000000000000000000000000000000000000',
              tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              orderType: 'Limit',
              startTime: 4102444800,
              endTime: 4102448400,
              inputStartAmount: '1000000',
              inputEndAmount: '1000000',
              // the string comparison picks the fee output ('99999...' > '2000...'); deliberate, for parity
              outputStartAmount: '99999999999999',
              outputEndAmount: '99999999999999',
            },
          },
        ],
      ],
      exclusiveFillerNotices: [],
      cosignedDigests: [],
      metrics: [...requestCounters(1, '2XX')],
    },
  },
}

export const AcceptedWithCaveats = {
  untypedLimit: { route: LIMIT_ROUTE, request: body(Orders.limit), expected: AcceptedPosts.Limit.expected },
  priorityNotFillableYet: {
    route: DUTCH_ROUTE,
    request: body(Orders.priority, 'Priority'),
    expected: {
      response: { statusCode: 201, body: { hash: Orders.priority.orderHash } },
      stored: true,
      metrics: [...requestCounters(8453, '2XX')],
    },
  },
  trackerStartFails: {
    route: DUTCH_ROUTE,
    request: body(Orders.dutchV2, 'Dutch_V2'),
    expected: {
      response: { statusCode: 201, body: { hash: Orders.dutchV2.orderHash } },
      stored: true,
      metrics: [
        ...requestCounters(1, '2XX'),
        ...MAINNET_V2_STALENESS,
        ...noticeMetrics(1),
        ['PostOrderPostPersistFailure', 1, 'Count'],
      ],
    },
  },
}

// A request rejected before the handler runs (invalid JSON, a Joi 400) records its counters on its
// own metrics logger. Changed on purpose: they used to go to the logger the previous request on the
// instance installed, which had already flushed (none on a cold start), so the alarms undercounted.
export const PostRejections = {
  invalidJson: {
    route: DUTCH_ROUTE,
    request: '{"encodedOrder":',
    expected: {
      response: { statusCode: 422, body: { detail: 'Invalid JSON body', errorCode: 'VALIDATION_ERROR' } },
      metrics: [...requestCounters(0, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  missingEncodedOrder: {
    route: DUTCH_ROUTE,
    request: { ...body(Orders.dutchV2, 'Dutch_V2'), encodedOrder: undefined },
    expected: {
      response: { statusCode: 400, body: { detail: '"encodedOrder" is required', errorCode: 'VALIDATION_ERROR' } },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  malformedEncodedOrder: {
    route: DUTCH_ROUTE,
    request: { ...body(Orders.dutchV2, 'Dutch_V2'), encodedOrder: '0xbad_order' },
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail:
            '"encodedOrder" with value "0xbad_order" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,4000}$/',
          errorCode: 'VALIDATION_ERROR',
        },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  malformedSignature: {
    route: DUTCH_ROUTE,
    request: { ...body(Orders.dutchV2, 'Dutch_V2'), signature: '0xbad_signature' },
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail:
            '"signature" with value "0xbad_signature" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{130}$/',
          errorCode: 'VALIDATION_ERROR',
        },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  unsupportedChainIdDutchRoute: {
    route: DUTCH_ROUTE,
    request: { ...body(Orders.dutchV2, 'Dutch_V2'), chainId: 0 },
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail:
            '"chainId" must be one of [1, 10, 56, 130, 137, 143, 196, 480, 11155111, 1301, 1868, 4217, 8453, 42161, 42220, 43114, 81457, 7777777, 4663, 5042, 57073]',
          errorCode: 'VALIDATION_ERROR',
        },
      },
      metrics: [...requestCounters(0, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  unsupportedChainIdLimitRoute: {
    route: LIMIT_ROUTE,
    request: { ...body(Orders.limit, 'Limit'), chainId: 0 },
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail:
            '"chainId" must be one of [1, 10, 56, 130, 137, 143, 196, 480, 11155111, 1301, 1868, 4217, 8453, 42161, 42220, 43114, 81457, 7777777, 4663, 5042, 57073]',
          errorCode: 'VALIDATION_ERROR',
        },
      },
      metrics: [...requestCounters(0, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  malformedQuoteId: {
    route: DUTCH_ROUTE,
    request: { ...body(Orders.dutchV2, 'Dutch_V2'), quoteId: 'not_UUIDV4' },
    expected: {
      response: { statusCode: 400, body: { detail: '"quoteId" must be a valid GUID', errorCode: 'VALIDATION_ERROR' } },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  malformedRequestId: {
    route: DUTCH_ROUTE,
    request: { ...body(Orders.dutchV2, 'Dutch_V2'), requestId: 'not_UUIDV4' },
    expected: {
      response: {
        statusCode: 400,
        body: { detail: '"requestId" must be a valid GUID', errorCode: 'VALIDATION_ERROR' },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  unknownOrderType: {
    route: DUTCH_ROUTE,
    request: body(Orders.dutchV2, 'Dutch_V4'),
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail: '"orderType" must be one of [Dutch, DutchLimit, Dutch_V2, Dutch_V3, Limit, Priority]',
          errorCode: 'VALIDATION_ERROR',
        },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  unparseableOrder: {
    route: DUTCH_ROUTE,
    request: { ...body(Orders.dutchV2, 'Dutch_V2'), encodedOrder: '0x01' },
    expected: {
      response: {
        statusCode: 400,
        body: {
          // the SDK's ABI decoding error, verbatim
          detail: 'data out-of-bounds (length=1, offset=32, code=BUFFER_OVERRUN, version=abi/5.8.0)',
          errorCode: 'ORDER_PARSE_FAIL',
          id: 'testRequest',
        },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  orderTypeDutch: {
    route: LIMIT_ROUTE,
    request: body(Orders.limit, 'Dutch'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Unsupported orderType: Dutch', errorCode: 'ORDER_PARSE_FAIL', id: 'testRequest' },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  orderTypeDutchLimit: {
    route: LIMIT_ROUTE,
    request: body(Orders.limit, 'DutchLimit'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Unsupported orderType: DutchLimit', errorCode: 'ORDER_PARSE_FAIL', id: 'testRequest' },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  decayingV1LimitRoute: {
    route: LIMIT_ROUTE,
    request: body(Orders.decayingV1),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Unsupported orderType: Dutch', errorCode: 'ORDER_PARSE_FAIL', id: 'testRequest' },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  decayingV1DutchRoute: {
    route: DUTCH_ROUTE,
    request: body(Orders.decayingV1),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Unsupported orderType: Dutch', errorCode: 'ORDER_PARSE_FAIL', id: 'testRequest' },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  limitOnDutchRoute: {
    route: DUTCH_ROUTE,
    request: body(Orders.limit, 'Limit'),
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail: 'Limit orders must be posted to /v2/limit-order',
          errorCode: 'INVALID_ORDER',
          id: 'testRequest',
        },
      },
      metrics: [...requestCounters(1, '4XX'), ['PostOrderWrongRoute', 1, 'Count']],
      metricsOnPreviousRequestLogger: [],
    },
  },
  untypedLimitOnDutchRoute: {
    route: DUTCH_ROUTE,
    request: body(Orders.limit),
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail: 'Limit orders must be posted to /v2/limit-order',
          errorCode: 'INVALID_ORDER',
          id: 'testRequest',
        },
      },
      metrics: [...requestCounters(1, '4XX'), ['PostOrderWrongRoute', 1, 'Count']],
      metricsOnPreviousRequestLogger: [],
    },
  },
  dutchV2OnLimitRoute: {
    route: LIMIT_ROUTE,
    request: body(Orders.dutchV2, 'Dutch_V2'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Dutch_V2 orders must be posted to /v2/order', errorCode: 'INVALID_ORDER', id: 'testRequest' },
      },
      metrics: [...requestCounters(1, '4XX'), ...MAINNET_V2_STALENESS, ['PostOrderWrongRoute', 1, 'Count']],
      metricsOnPreviousRequestLogger: [],
    },
  },
  dutchV3OnLimitRoute: {
    route: LIMIT_ROUTE,
    request: body(Orders.dutchV3, 'Dutch_V3'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Dutch_V3 orders must be posted to /v2/order', errorCode: 'INVALID_ORDER', id: 'testRequest' },
      },
      metrics: [...requestCounters(42161, '4XX'), ['PostOrderWrongRoute', 1, 'Count']],
      metricsOnPreviousRequestLogger: [],
    },
  },
  priorityOnLimitRoute: {
    route: LIMIT_ROUTE,
    request: body(Orders.priority, 'Priority'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Priority orders must be posted to /v2/order', errorCode: 'INVALID_ORDER', id: 'testRequest' },
      },
      metrics: [...requestCounters(8453, '4XX'), ['PostOrderWrongRoute', 1, 'Count']],
      metricsOnPreviousRequestLogger: [],
    },
  },
  offchainValidationFailure: {
    route: DUTCH_ROUTE,
    request: body(Orders.dutchV2, 'Dutch_V2'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'testing offchain validation', errorCode: 'INVALID_ORDER', id: 'testRequest' },
      },
      metrics: [...requestCounters(1, '4XX'), ...MAINNET_V2_STALENESS, ['OffchainValidationFailure', 1, 'Count']],
      metricsOnPreviousRequestLogger: [],
    },
  },
  onchainValidationFailure: {
    route: DUTCH_ROUTE,
    request: body(Orders.dutchV2, 'Dutch_V2'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'Onchain validation failed: ValidationFailed', errorCode: 'INVALID_ORDER', id: 'testRequest' },
      },
      metrics: [...requestCounters(1, '4XX'), ...MAINNET_V2_STALENESS],
      metricsOnPreviousRequestLogger: [],
    },
  },
  permissionedV2BadCosignature: {
    route: DUTCH_ROUTE,
    request: body(Orders.permissionedV2, 'Dutch_V2'),
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail: 'Signature validation failed: InvalidCosignature',
          errorCode: 'INVALID_ORDER',
          id: 'testRequest',
        },
      },
      metrics: [
        ...requestCounters(1, '4XX'),
        ...MAINNET_V2_STALENESS,
        ['PermissionedOrderAuthenticationFailed', 1, 'Count'],
      ],
      metricsOnPreviousRequestLogger: [],
    },
  },
  permissionedPriority: {
    route: DUTCH_ROUTE,
    request: body(Orders.permissionedPriority, 'Priority'),
    expected: {
      response: {
        statusCode: 400,
        body: {
          detail: "Permissioned tokens shouldn't work with priority/v3 dutch orders",
          errorCode: 'INVALID_ORDER',
          id: 'testRequest',
        },
      },
      metrics: [...requestCounters(1, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  priorityAuctionStartBeforeTarget: {
    route: DUTCH_ROUTE,
    request: body(Orders.priorityLowStart, 'Priority'),
    expected: {
      response: {
        statusCode: 400,
        body: { detail: 'auctionStartBlock too low', errorCode: 'INVALID_ORDER', id: 'testRequest' },
      },
      metrics: [...requestCounters(8453, '4XX')],
      metricsOnPreviousRequestLogger: [],
    },
  },
  zeroTokenIn: {
    route: DUTCH_ROUTE,
    request: body(Orders.zeroTokenIn, 'Dutch_V2'),
    expected: {
      response: { statusCode: 400, body: { errorCode: 'INVALID_TOKEN_IN_ADDRESS', id: 'testRequest' } },
      metrics: [...requestCounters(1, '4XX'), ...MAINNET_V2_STALENESS],
      metricsOnPreviousRequestLogger: [],
    },
  },
}

export const OpenOrderLimit = {
  request: body(Orders.openOrderLimit, 'Dutch_V2'),
  atLimit: {
    response: { statusCode: 201, body: { hash: Orders.openOrderLimit.orderHash } },
    metrics: [...requestCounters(1, '2XX'), ...MAINNET_V2_STALENESS, ...noticeMetrics(1)],
  },
  overLimit: {
    response: { statusCode: 403, body: { errorCode: 'TOO_MANY_OPEN_ORDERS', id: 'testRequest' } },
    metrics: [...requestCounters(1, '4XX'), ...MAINNET_V2_STALENESS],
  },
}
