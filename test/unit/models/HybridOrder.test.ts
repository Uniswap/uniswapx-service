import { Logger } from '@aws-lambda-powertools/logger'
import { Block } from '@ethersproject/abstract-provider'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { KmsSigner } from '@uniswap/signer'
import { OrderType } from '@uniswap/uniswapx-sdk'
import axios from 'axios'
import { ethers } from 'ethers'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { HYBRID_ORDER_TARGET_BLOCK_BUFFER } from '../../../lib/handlers/constants'
import { GetHybridOrderResponse } from '../../../lib/handlers/get-orders/schema/GetHybridOrderResponse'
import { HardQuote } from '../../../lib/handlers/post-order/schema'
import { HybridOrder } from '../../../lib/models/HybridOrder'
import { ChainId } from '../../../lib/util/chain'
import { SDKHybridOrderFactory } from '../../factories/SDKHybridOrderFactory'
import { MOCK_SIGNATURE } from '../../test-data'
import { COSIGNATURE, MOCK_LATEST_BLOCK } from '../fixtures'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('HybridOrder Model', () => {
  const log = mock<Logger>()
  const mockCosigner = mock<KmsSigner>()

  const createMockProvider = (blockNumber = MOCK_LATEST_BLOCK, timestamp?: number) => {
    const mockProvider = mock<StaticJsonRpcProvider>()
    mockProvider.getBlock.mockResolvedValue({
      number: blockNumber,
      timestamp: timestamp ?? Math.floor(Date.now() / 1000),
    } as Partial<Block> as Block)
    return mockProvider
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env['INITIALIZER_URL']
    delete process.env['SCALE_WORSE']
    mockCosigner.signDigest.mockResolvedValue(COSIGNATURE)
  })

  describe('toEntity', () => {
    test('converts HybridOrder to entity correctly', () => {
      const order = new HybridOrder(SDKHybridOrderFactory.buildHybridOrder(), MOCK_SIGNATURE, ChainId.MAINNET)
      const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

      expect(entity.signature).toEqual(MOCK_SIGNATURE)
      expect(entity.encodedOrder).toEqual(order.inner.serialize())
      expect(entity.orderStatus).toEqual(ORDER_STATUS.OPEN)
      expect(entity.orderHash).toEqual(order.inner.hash().toLowerCase())
      expect(entity.type).toEqual(OrderType.Hybrid)
    })
  })

  describe('fromEntity', () => {
    test('reconstructs HybridOrder from entity', () => {
      const order = new HybridOrder(
        SDKHybridOrderFactory.buildHybridOrder(),
        MOCK_SIGNATURE,
        ChainId.MAINNET,
        ORDER_STATUS.OPEN,
        undefined,
        undefined,
        undefined,
        100
      )
      const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)
      const fromEntity = HybridOrder.fromEntity(entity, log)

      expect(fromEntity.signature).toEqual(order.signature)
      expect(fromEntity.chainId).toEqual(order.chainId)
      expect(fromEntity.orderStatus).toEqual(order.orderStatus)
      expect(fromEntity.createdAt).toEqual(100)
    })
  })

  describe('toGetResponse', () => {
    test('converts HybridOrder to GetResponse format', () => {
      const order = new HybridOrder(
        SDKHybridOrderFactory.buildHybridOrder(),
        MOCK_SIGNATURE,
        ChainId.MAINNET,
        ORDER_STATUS.OPEN,
        undefined,
        undefined,
        undefined,
        100
      )
      const response: GetHybridOrderResponse = order.toGetResponse()

      expect(response.type).toEqual(OrderType.Hybrid)
      expect(response.orderStatus).toEqual(order.orderStatus)
      expect(response.signature).toEqual(order.signature)
      expect(response.encodedOrder).toEqual(order.inner.serialize())
      expect(response.chainId).toEqual(order.chainId)
      expect(response.orderHash).toEqual(order.inner.hash())
      expect(response.swapper).toEqual(order.inner.info.swapper)
      expect(response.reactor).toEqual(order.inner.info.reactor)
      expect(response.deadline).toEqual(order.inner.info.deadline)
      expect(response.input.token).toEqual(order.inner.info.input.token)
      expect(response.input.maxAmount).toEqual(order.inner.info.input.maxAmount.toString())
      expect(response.cosignature).toEqual(order.inner.info.cosignature)
    })
  })

  describe('reparameterizeAndCosign', () => {
    describe('without INITIALIZER_URL (fallback to local cosigner)', () => {
      test('uses local KmsSigner when INITIALIZER_URL is not set', async () => {
        const mockProvider = createMockProvider()
        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100), // High enough to not be stale
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        const result = await order.reparameterizeAndCosign(mockProvider, mockCosigner)

        expect(mockCosigner.signDigest).toHaveBeenCalled()
        expect(result.inner.info.cosignature).toEqual(COSIGNATURE)
        expect(mockedAxios.post).not.toHaveBeenCalled()
      })

      test('sets auctionTargetBlock correctly when price curve exists', async () => {
        const mockProvider = createMockProvider()
        const BASE_SCALING_FACTOR = ethers.constants.WeiPerEther
        const priceCurveValue = BASE_SCALING_FACTOR.mul(105).div(100) // Non-empty price curve

        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
          priceCurve: [priceCurveValue.toString()],
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        await order.reparameterizeAndCosign(mockProvider, mockCosigner)

        const expectedTargetBlock = MOCK_LATEST_BLOCK + HYBRID_ORDER_TARGET_BLOCK_BUFFER[ChainId.MAINNET]
        expect(order.inner.info.cosignerData.auctionTargetBlock.toNumber()).toEqual(expectedTargetBlock)
      })

      test('adds extra block when timestamp difference is > 75% of block time', async () => {
        // Simulate a block with timestamp significantly in the past
        const currentTime = Math.floor(Date.now() / 1000)
        const oldTimestamp = currentTime - 15 // 15 seconds ago, > 75% of ~12 second block time
        const mockProvider = createMockProvider(MOCK_LATEST_BLOCK, oldTimestamp)

        const BASE_SCALING_FACTOR = ethers.constants.WeiPerEther
        const priceCurveValue = BASE_SCALING_FACTOR.mul(105).div(100) // Non-empty price curve

        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
          priceCurve: [priceCurveValue.toString()],
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        await order.reparameterizeAndCosign(mockProvider, mockCosigner)

        // Should add extra block due to stale timestamp
        const expectedTargetBlock = MOCK_LATEST_BLOCK + HYBRID_ORDER_TARGET_BLOCK_BUFFER[ChainId.MAINNET] + 1
        expect(order.inner.info.cosignerData.auctionTargetBlock.toNumber()).toEqual(expectedTargetBlock)
      })
    })

    describe('with INITIALIZER_URL (external cosigner)', () => {
      const MOCK_INITIALIZER_URL = 'https://initializer.example.com'
      const MOCK_INITIALIZER_COSIGNATURE = '0xaabbccdd1234567890abcdef'

      beforeEach(() => {
        process.env['INITIALIZER_URL'] = MOCK_INITIALIZER_URL
      })

      test('calls initializer endpoint when INITIALIZER_URL is set', async () => {
        const mockProvider = createMockProvider()
        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        mockedAxios.post.mockResolvedValueOnce({
          data: {
            success: true,
            receivedFeedIds: [],
            usedFeedIds: [],
            signedOrder: {
              orderType: 'HYBRID',
              cosignature: MOCK_INITIALIZER_COSIGNATURE,
            },
            chainId: ChainId.MAINNET,
            encodedOrder: '0x...',
            processingStatus: 'signed',
            timestamp: Date.now(),
          },
        })

        const result = await order.reparameterizeAndCosign(mockProvider, mockCosigner)

        expect(mockedAxios.post).toHaveBeenCalledWith(
          `${MOCK_INITIALIZER_URL}/cosign/hybrid`,
          expect.objectContaining({
            encodedOrder: expect.any(String),
            chainId: ChainId.MAINNET,
            signature: MOCK_SIGNATURE,
          }),
          expect.objectContaining({
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          })
        )
        expect(result.inner.info.cosignature).toEqual(MOCK_INITIALIZER_COSIGNATURE)
        expect(mockCosigner.signDigest).not.toHaveBeenCalled()
      })

      test('throws error when initializer returns success=false', async () => {
        const mockProvider = createMockProvider()
        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        mockedAxios.post.mockResolvedValueOnce({
          data: {
            success: false,
            processingStatus: 'failed',
          },
        })

        await expect(order.reparameterizeAndCosign(mockProvider, mockCosigner)).rejects.toThrow(
          'Initializer cosign request failed: processingStatus=failed'
        )
      })

      test('propagates axios errors', async () => {
        const mockProvider = createMockProvider()
        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        mockedAxios.post.mockRejectedValueOnce(new Error('Network error'))

        await expect(order.reparameterizeAndCosign(mockProvider, mockCosigner)).rejects.toThrow('Network error')
      })
    })

    describe('with hardQuote for price scaling', () => {
      const createHardQuote = (inputAmount: string, outputAmount: string): HardQuote => ({
        quoteId: 'test-quote-id',
        requestId: 'test-request-id',
        tokenInChainId: ChainId.MAINNET,
        tokenOutChainId: ChainId.MAINNET,
        tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        input: {
          token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          amount: inputAmount,
        },
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        outputs: [
          {
            token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            amount: outputAmount,
            recipient: '0x0000000000000000000000000000000000000000',
          },
        ],
        swapper: '0x0000000000000000000000000000000000000000',
        filler: '0x0000000000000000000000000000000000000000',
        orderHash: '0x1234567890abcdef',
        createdAt: Math.floor(Date.now() / 1000),
        createdAtMs: Date.now().toString(),
      })

      test('returns empty supplementalPriceCurve when price curve is empty', async () => {
        const mockProvider = createMockProvider()

        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
          priceCurve: [], // Empty price curve
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        await order.reparameterizeAndCosign(mockProvider, mockCosigner)

        expect(order.inner.info.cosignerData.auctionTargetBlock.toNumber()).toEqual(0)
        expect(order.inner.info.cosignerData.supplementalPriceCurve).toEqual([])
      })

      test('sets auctionTargetBlock without supplementalPriceCurve when no hardQuote', async () => {
        const mockProvider = createMockProvider()

        const BASE_SCALING_FACTOR = ethers.constants.WeiPerEther
        const priceCurveValue = BASE_SCALING_FACTOR.mul(105).div(100)

        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
          priceCurve: [priceCurveValue.toString()],
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        await order.reparameterizeAndCosign(mockProvider, mockCosigner)

        const expectedTargetBlock = MOCK_LATEST_BLOCK + HYBRID_ORDER_TARGET_BLOCK_BUFFER[ChainId.MAINNET]
        expect(order.inner.info.cosignerData.auctionTargetBlock.toNumber()).toEqual(expectedTargetBlock)
        expect(order.inner.info.cosignerData.supplementalPriceCurve).toEqual([])
      })

      test('returns empty supplementalPriceCurve when calculated scale equals base (no price improvement)', async () => {
        const mockProvider = createMockProvider()
        const BASE = ethers.constants.WeiPerEther

        // Exact output order: scalingFactor < 1e18
        const scalingFactor = BASE.mul(90).div(100) // 0.9x (exact output)
        const priceCurve = BASE.mul(95).div(100) // 0.95x

        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
          scalingFactor: scalingFactor.toString(),
          priceCurve: [priceCurve.toString()],
          input: {
            maxAmount: '1000000', // Same as quote input = scale of 1.0
          },
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        // Quote input equals maxAmount, so scale = 1.0 (neutral)
        const hardQuote = createHardQuote('1000000', '1000000000000000000')

        await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

        // Scale equals BASE, so supplementalPriceCurve should be empty
        expect(order.inner.info.cosignerData.supplementalPriceCurve).toEqual([])
      })

      test('returns empty supplementalPriceCurve when scalingFactor is neutral (1e18)', async () => {
        const mockProvider = createMockProvider()
        const BASE = ethers.constants.WeiPerEther

        // Neutral scaling factor with non-neutral price curve
        const priceCurve = BASE.mul(105).div(100) // 1.05x

        const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
          auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
          scalingFactor: BASE.toString(), // Neutral 1e18
          priceCurve: [priceCurve.toString()],
          input: {
            maxAmount: '2000000',
          },
        })
        const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

        const hardQuote = createHardQuote('1000000', '1000000000000000000')

        await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

        // Scaling factor is neutral, so supplementalPriceCurve should be empty
        expect(order.inner.info.cosignerData.supplementalPriceCurve).toEqual([])
      })

      describe('exact output orders (scalingFactor < 1e18) - supplementalPriceCurve value tests', () => {
        // Note: For exact output orders, scalingFactor < 1e18.
        // When scale > 1e18, directions mismatch and curve is empty unless SCALE_WORSE=true.
        // These tests use SCALE_WORSE=true to verify the actual calculation values.

        beforeEach(() => {
          process.env['SCALE_WORSE'] = 'true'
        })

        test('calculates correct supplementalPriceCurve for 2x scale improvement', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          // Exact output order configuration
          const scalingFactor = BASE.mul(90).div(100) // 0.9x indicates exact output
          const priceCurve = BASE.mul(95).div(100) // 0.95x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '2000000', // 2x the quote input
            },
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // Quote says we only need 1000000 input for the same output
          // scale = maxInput * 1e18 / quoteInput = 2000000 * 1e18 / 1000000 = 2e18
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // Exact output: scale DOWN the curve (better price = less input needed)
          // supplementalPriceCurve = priceCurve * BASE / scale = 0.95e18 * 1e18 / 2e18 = 0.475e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toHaveLength(1)
          expect(order.inner.info.cosignerData.supplementalPriceCurve[0].toString()).toEqual(
            BASE.mul(475).div(1000).toString() // 0.475e18
          )
        })

        test('calculates correct supplementalPriceCurve for 1.5x scale improvement', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          const scalingFactor = BASE.mul(80).div(100) // 0.8x exact output
          const priceCurve = BASE.mul(90).div(100) // 0.9x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '1500000', // 1.5x the quote input
            },
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // scale = 1500000 * 1e18 / 1000000 = 1.5e18
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // Exact output: scale DOWN the curve
          // supplementalPriceCurve = priceCurve * BASE / scale = 0.9e18 * 1e18 / 1.5e18 = 0.6e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toHaveLength(1)
          expect(order.inner.info.cosignerData.supplementalPriceCurve[0].toString()).toEqual(
            BASE.mul(60).div(100).toString() // 0.6e18
          )
        })

        test('handles multiple price curve values correctly', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          const scalingFactor = BASE.mul(80).div(100) // 0.8x exact output
          // Multiple price curve points
          const priceCurve1 = BASE.mul(90).div(100) // 0.9x
          const priceCurve2 = BASE.mul(85).div(100) // 0.85x
          const priceCurve3 = BASE.mul(80).div(100) // 0.8x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve1.toString(), priceCurve2.toString(), priceCurve3.toString()],
            input: {
              maxAmount: '2000000', // 2x scale
            },
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // Exact output with scale = 2e18: scale DOWN each curve value by dividing by 2
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toHaveLength(3)

          // curve1: 0.9e18 / 2 = 0.45e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve[0].toString()).toEqual(
            BASE.mul(45).div(100).toString()
          )
          // curve2: 0.85e18 / 2 = 0.425e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve[1].toString()).toEqual(
            BASE.mul(425).div(1000).toString()
          )
          // curve3: 0.8e18 / 2 = 0.4e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve[2].toString()).toEqual(
            BASE.mul(40).div(100).toString()
          )
        })

        test('calculates correct values when scale and scalingFactor have same direction (both < 1)', async () => {
          // Reset SCALE_WORSE to test the matching direction case
          delete process.env['SCALE_WORSE']

          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          // Exact output order: scalingFactor < 1e18
          const scalingFactor = BASE.mul(90).div(100) // 0.9x
          const priceCurve = BASE.mul(95).div(100) // 0.95x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '500000',
            },
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // scale = 500000 * 1e18 / 1000000 = 0.5e18
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // Exact output: scale DOWN by dividing by scale
          // supplementalPriceCurve = priceCurve * BASE / scale = 0.95e18 * 1e18 / 0.5e18 = 1.9e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toHaveLength(1)
          expect(order.inner.info.cosignerData.supplementalPriceCurve[0].toString()).toEqual(
            BASE.mul(190).div(100).toString() // 1.9e18
          )
        })
      })

      describe('exact input orders (scalingFactor > 1e18) - supplementalPriceCurve value tests', () => {
        test('calculates correct supplementalPriceCurve for exact input with 2x scale', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          // Exact input order: scalingFactor > 1e18
          const scalingFactor = BASE.mul(110).div(100) // 1.1x indicates exact input
          const priceCurve = BASE.mul(105).div(100) // 1.05x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '1000000',
            },
            outputs: [
              {
                minAmount: '500000000000000000', // 0.5 ETH min output
                recipient: '0x0000000000000000000000000000000000000000',
              },
            ],
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // For exact input:
          // projectedInput = minOutput * quoteInput / quoteOutput
          //                = 0.5e18 * 1000000 / 1e18 = 500000
          // scale = maxInput * 1e18 / projectedInput = 1000000 * 1e18 / 500000 = 2e18
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // Exact input: scale UP the curve (better price = more output)
          // supplementalPriceCurve = priceCurve * scale / BASE = 1.05e18 * 2e18 / 1e18 = 2.1e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toHaveLength(1)
          expect(order.inner.info.cosignerData.supplementalPriceCurve[0].toString()).toEqual(
            BASE.mul(210).div(100).toString() // 2.1e18
          )
        })

        test('calculates correct supplementalPriceCurve for exact input with 1.25x scale', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          const scalingFactor = BASE.mul(120).div(100) // 1.2x exact input
          const priceCurve = BASE.mul(110).div(100) // 1.1x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '1000000',
            },
            outputs: [
              {
                minAmount: '800000000000000000', // 0.8 ETH min output
                recipient: '0x0000000000000000000000000000000000000000',
              },
            ],
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // projectedInput = 0.8e18 * 1000000 / 1e18 = 800000
          // scale = 1000000 * 1e18 / 800000 = 1.25e18
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // Exact input: scale UP the curve
          // supplementalPriceCurve = priceCurve * scale / BASE = 1.1e18 * 1.25e18 / 1e18 = 1.375e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toHaveLength(1)
          expect(order.inner.info.cosignerData.supplementalPriceCurve[0].toString()).toEqual(
            BASE.mul(1375).div(1000).toString() // 1.375e18
          )
        })
      })

      describe('scaleWorse behavior', () => {
        test('returns empty supplementalPriceCurve when scale direction opposes scalingFactor and scaleWorse=false', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          // Exact input order: scalingFactor > 1e18
          const scalingFactor = BASE.mul(110).div(100) // 1.1x (> BASE)
          const priceCurve = BASE.mul(105).div(100) // 1.05x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '1000000',
            },
            outputs: [
              {
                minAmount: '2000000000000000000', // 2 ETH min output - will make scale < 1
                recipient: '0x0000000000000000000000000000000000000000',
              },
            ],
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // projectedInput = 2e18 * 1000000 / 1e18 = 2000000
          // scale = 1000000 * 1e18 / 2000000 = 0.5e18 (< BASE)
          // scalingFactor is 1.1e18 (> BASE), so directions mismatch
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // With scaleWorse=false (default), mismatched directions = empty curve
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toEqual([])
        })

        test('generates supplementalPriceCurve when scaleWorse=true even with direction mismatch', async () => {
          process.env['SCALE_WORSE'] = 'true'
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          // Exact input order: scalingFactor > 1e18
          const scalingFactor = BASE.mul(110).div(100) // 1.1x (> BASE)
          const priceCurve = BASE.mul(105).div(100) // 1.05x

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '1000000',
            },
            outputs: [
              {
                minAmount: '2000000000000000000', // 2 ETH min output - will make scale < 1
                recipient: '0x0000000000000000000000000000000000000000',
              },
            ],
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // scale = 0.5e18 (< BASE), scalingFactor = 1.1e18 (> BASE) - mismatch
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // With scaleWorse=true, even with mismatch, curve should be generated
          // Exact input: scale UP the curve
          // supplementalPriceCurve = priceCurve * scale / BASE = 1.05e18 * 0.5e18 / 1e18 = 0.525e18
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toHaveLength(1)
          expect(order.inner.info.cosignerData.supplementalPriceCurve[0].toString()).toEqual(
            BASE.mul(525).div(1000).toString() // 0.525e18
          )
        })
      })

      describe('edge cases', () => {
        test('returns base scaling factor when quote input is zero', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          const scalingFactor = BASE.mul(90).div(100)
          const priceCurve = BASE.mul(95).div(100)

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '1000000',
            },
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // Zero input amount should return neutral scale
          const hardQuote = createHardQuote('0', '1000000000000000000')

          await order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)

          // When scale equals base, supplementalPriceCurve should be empty
          expect(order.inner.info.cosignerData.supplementalPriceCurve).toEqual([])
        })

        test('throws error when hardQuote outputs length mismatches order outputs', async () => {
          const mockProvider = createMockProvider()
          const BASE = ethers.constants.WeiPerEther

          const scalingFactor = BASE.mul(110).div(100) // Exact input
          const priceCurve = BASE.mul(105).div(100)

          const sdkOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
            auctionStartBlock: String(MOCK_LATEST_BLOCK + 100),
            scalingFactor: scalingFactor.toString(),
            priceCurve: [priceCurve.toString()],
            input: {
              maxAmount: '1000000',
            },
            outputs: [
              {
                minAmount: '1000000000000000000',
                recipient: '0x0000000000000000000000000000000000000000',
              },
              {
                minAmount: '500000000000000000',
                recipient: '0x0000000000000000000000000000000000000001',
              },
            ],
          })
          const order = new HybridOrder(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)

          // Only one output in hardQuote but order has two
          const hardQuote = createHardQuote('1000000', '1000000000000000000')

          await expect(order.reparameterizeAndCosign(mockProvider, mockCosigner, hardQuote)).rejects.toThrow(
            'Hard quote outputs length does not match order outputs length'
          )
        })
      })
    })
  })

  describe('orderType', () => {
    test('returns OrderType.Hybrid', () => {
      const order = new HybridOrder(SDKHybridOrderFactory.buildHybridOrder(), MOCK_SIGNATURE, ChainId.MAINNET)
      expect(order.orderType).toEqual(OrderType.Hybrid)
    })
  })
})
