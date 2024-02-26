/* eslint-disable */
import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { EventWatcher, OrderValidation, OrderValidator, SignedOrder } from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { BigNumber } from 'ethers'
import { BATCH_READ_MAX, OnChainStatusChecker } from '../../../lib/compute/on-chain-status-checker'
import { ORDER_STATUS } from '../../../lib/entities'
import { getProvider, getValidator, getWatcher } from '../../../lib/handlers/check-order-status/util'
import { log } from '../../../lib/Logging'
import { OnChainStatusCheckerMetricNames, powertoolsMetric } from '../../../lib/Metrics'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { deleteAllRepoEntries } from '../utils'
import { dynamoConfig, MOCK_ORDER_ENTITY, MOCK_ORDER_HASH, MOCK_SIGNATURE } from './test-data'

jest.mock('../../../lib/handlers/check-order-status/util', () => {
  const original = jest.requireActual('../../../lib/handlers/check-order-status/util')
  return {
    ...original,
    getWatcher: jest.fn(),
    getProvider: jest.fn(),
    getValidator: jest.fn(),
  }
})

const DELAY = 1000

describe('OnChainStatusChecker', () => {
  const documentClient = new DocumentClient(dynamoConfig)
  const ordersRepository = LimitOrdersRepository.create(documentClient)

  const mockedGetWatcher = getWatcher as jest.Mock
  const mockedGetProvider = getProvider as jest.Mock
  const mockedGetValidator = getValidator as jest.Mock

  const mockedBlockNumber = 0
  const getFillEventsMock = jest.fn()
  const getFillInfoMock = jest.fn()

  const providerMock = jest.fn().mockReturnValue(mockedBlockNumber)
  const getTransactionMock = jest.fn()

  afterAll(async () => {
    await deleteAllRepoEntries(ordersRepository)
  })

  describe('Database Integration', () => {
    let watcherSpy: jest.SpyInstance<EventWatcher, [provider: StaticJsonRpcProvider, chainId: number]>,
      providerSpy: jest.SpyInstance<StaticJsonRpcProvider, [chainId: number]>,
      validatorSpy: jest.SpyInstance<OrderValidator, [provider: StaticJsonRpcProvider, chainId: number]>,
      statusChecker: OnChainStatusChecker

    beforeEach(async () => {
      log.setLogLevel('SILENT')
      jest.clearAllMocks()
      statusChecker = new OnChainStatusChecker(ordersRepository)

      getTransactionMock.mockReturnValueOnce({
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      })

      watcherSpy = mockedGetWatcher.mockReturnValue({
        getFillEvents: getFillEventsMock,
        getFillInfo: getFillInfoMock,
      } as any)
      providerSpy = mockedGetProvider.mockReturnValue({
        getBlockNumber: providerMock,
        getTransaction: getTransactionMock,
        getBlock: () =>
          Promise.resolve({
            timestamp: 123456,
          }),
      } as any)
      validatorSpy = mockedGetValidator.mockReturnValue({
        validate: () => {
          return OrderValidation.NonceUsed
        },
        validateBatch: (arr: any) => {
          return arr.map(() => OrderValidation.NonceUsed)
        },
      } as any)
    })

    it('should close order with filled', async () => {
      await deleteAllRepoEntries(ordersRepository)
      getFillInfoMock.mockImplementation(() => {
        return [
          {
            orderHash: MOCK_ORDER_HASH,
            filler: '0x123',
            nonce: BigNumber.from(1),
            swapper: '0x123',
            blockNumber: 12321312313,
            txHash: '0x1244345323',
            inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
            outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
          },
        ]
      })

      await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_ENTITY)
      statusChecker.pollForOpenOrders()

      //TODO: fix this so no timeout needed
      await (async () => {
        return new Promise((resolve) => setTimeout(resolve, DELAY))
      })()

      statusChecker?.stop()

      let order = await ordersRepository.getByHash(MOCK_ORDER_HASH)
      expect(order?.orderStatus).toBe(ORDER_STATUS.FILLED)
      expect(watcherSpy).toHaveBeenCalled()
      expect(providerSpy).toHaveBeenCalled()
      expect(validatorSpy).toHaveBeenCalled()
    }, 10000)

    it('should close multiple orders with correct status', async () => {
      await deleteAllRepoEntries(ordersRepository)
      getFillInfoMock.mockImplementation(() => {
        return [
          {
            orderHash: MOCK_ORDER_HASH,
            filler: '0x123',
            nonce: BigNumber.from(1),
            swapper: '0x123',
            blockNumber: 12321312313,
            txHash: '0x1244345323',
            inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
            outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
          },
        ]
      })

      mockedGetValidator.mockReturnValue({
        validate: () => {
          return OrderValidation.NonceUsed
        },
        validateBatch: (arr: SignedOrder[]) => {
          return arr.map((o: SignedOrder) => {
            switch (o.signature) {
              case MOCK_SIGNATURE:
                return OrderValidation.NonceUsed
              case '0x1':
                return OrderValidation.InsufficientFunds
              case '0x2':
                return OrderValidation.InsufficientFunds
              default:
                throw new Error('test validation not mocked')
            }
          })
        },
      } as any)

      await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_ENTITY)
      await ordersRepository.putOrderAndUpdateNonceTransaction({
        ...MOCK_ORDER_ENTITY,
        orderHash: '0x1',
        signature: '0x1',
      })
      await ordersRepository.putOrderAndUpdateNonceTransaction({
        ...MOCK_ORDER_ENTITY,
        orderHash: '0x2',
        signature: '0x2',
      })

      statusChecker.pollForOpenOrders()

      await (async () => {
        return new Promise((resolve) => setTimeout(resolve, DELAY))
      })()

      statusChecker?.stop()

      let order = await ordersRepository.getByHash(MOCK_ORDER_HASH)
      let order2 = await ordersRepository.getByHash('0x1')
      let order3 = await ordersRepository.getByHash('0x2')

      expect(order?.orderStatus).toBe(ORDER_STATUS.FILLED)
      expect(order2?.orderStatus).toBe(ORDER_STATUS.INSUFFICIENT_FUNDS)
      expect(order3?.orderStatus).toBe(ORDER_STATUS.INSUFFICIENT_FUNDS)

      expect(watcherSpy).toHaveBeenCalled()
      expect(providerSpy).toHaveBeenCalled()
      expect(validatorSpy).toHaveBeenCalled()
    }, 10000)

    it('should page through orders', async () => {
      await deleteAllRepoEntries(ordersRepository)
      let promises = []
      for (let i = 0; i < BATCH_READ_MAX + 1; i++) {
        promises.push(ordersRepository.putOrderAndUpdateNonceTransaction({ ...MOCK_ORDER_ENTITY, orderHash: `0x${i}` }))
      }
      await Promise.all(promises)

      let checkStatusSpy = jest.spyOn(statusChecker, 'getOrderChangesBatch').mockResolvedValue([])
      statusChecker.pollForOpenOrders()

      await (async () => {
        return new Promise((resolve) => setTimeout(resolve, DELAY))
      })()

      statusChecker?.stop()

      expect(checkStatusSpy).toHaveBeenCalledTimes(3)
      expect(checkStatusSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ orderHash: `0x${BATCH_READ_MAX}` })]),
        1
      )
    })

    it('should report errors for batches', async () => {
      await deleteAllRepoEntries(ordersRepository)
      getFillInfoMock
        .mockImplementationOnce(() => {
          throw new Error('test error')
        })
        .mockImplementation(() => {
          return [
            {
              orderHash: MOCK_ORDER_HASH,
              filler: '0x123',
              nonce: BigNumber.from(1),
              swapper: '0x123',
              blockNumber: 12321312313,
              txHash: '0x1244345323',
              inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
              outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
            },
          ]
        })

      jest.mock('../../../lib/Metrics')
      const mockedMetrics = powertoolsMetric as jest.Mocked<typeof powertoolsMetric>
      mockedMetrics.addMetric = jest.fn()
      mockedMetrics.publishStoredMetrics = jest.fn()

      await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_ENTITY)
      await ordersRepository.putOrderAndUpdateNonceTransaction({ ...MOCK_ORDER_ENTITY, orderHash: '0x02' })

      statusChecker.pollForOpenOrders()

      await (async () => {
        return new Promise((resolve) => setTimeout(resolve, DELAY))
      })()

      statusChecker?.stop()

      expect(mockedMetrics.addMetric).toHaveBeenCalledWith(
        OnChainStatusCheckerMetricNames.TotalOrderProcessingErrors,
        MetricUnits.Count,
        2
      )
      expect(mockedMetrics.addMetric).toHaveBeenCalledWith(
        OnChainStatusCheckerMetricNames.TotalProcessedOpenOrders,
        MetricUnits.Count,
        2
      )
    }, 10000)
  })
})
