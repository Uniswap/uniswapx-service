/* eslint-disable */
import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { EventWatcher, OrderValidation, OrderValidator } from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { BigNumber } from 'ethers'
import { BATCH_READ_MAX, OnChainStatusChecker } from '../../../lib/compute/on-chain-status-checker'
import { ORDER_STATUS } from '../../../lib/entities'
import { log } from '../../../lib/Logging'
import { OnChainStatusCheckerMetricNames, powertoolsMetric } from '../../../lib/Metrics'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { deleteAllRepoEntries } from '../utils'
import { dynamoConfig, MOCK_ORDER_ENTITY, MOCK_ORDER_HASH } from './test-data'

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = LimitOrdersRepository.create(documentClient)

describe('OnChainStatusChecker', () => {
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

    afterEach(() => {
      statusChecker?.stop()
    })

    beforeEach(async () => {
      await deleteAllRepoEntries(ordersRepository)
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

      watcherSpy = jest.spyOn(statusChecker, 'getWatcher').mockReturnValue({
        getFillEvents: getFillEventsMock,
        getFillInfo: getFillInfoMock,
      } as any)
      providerSpy = jest.spyOn(statusChecker, 'getProvider').mockReturnValue({
        getBlockNumber: providerMock,
        getTransaction: getTransactionMock,
        getBlock: () =>
          Promise.resolve({
            timestamp: 123456,
          }),
      } as any)
      validatorSpy = jest.spyOn(statusChecker, 'getValidator').mockReturnValue({
        validate: () => {
          return OrderValidation.NonceUsed
        },
      } as any)
    })

    it('should close order with filled', async () => {
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

      await (async () => {
        return new Promise((resolve) => setTimeout(resolve, 1000))
      })()

      let order = await ordersRepository.getByHash(MOCK_ORDER_HASH)
      expect(order?.orderStatus).toBe(ORDER_STATUS.FILLED)
      expect(watcherSpy).toHaveBeenCalled()
      expect(providerSpy).toHaveBeenCalled()
      expect(validatorSpy).toHaveBeenCalled()
    }, 10000)

    it('should page through orders', async () => {
      let promises = []
      for (let i = 0; i < BATCH_READ_MAX + 1; i++) {
        promises.push(ordersRepository.putOrderAndUpdateNonceTransaction({ ...MOCK_ORDER_ENTITY, orderHash: `0x${i}` }))
      }
      await Promise.all(promises)

      let checkStatusSpy = jest.spyOn(statusChecker, 'updateOrder').mockResolvedValue()
      statusChecker.pollForOpenOrders()

      await (async () => {
        return new Promise((resolve) => setTimeout(resolve, 1000))
      })()

      expect(checkStatusSpy).toHaveBeenCalledTimes(BATCH_READ_MAX + 1)
      expect(checkStatusSpy).toHaveBeenCalledWith(expect.objectContaining({ orderHash: `0x${BATCH_READ_MAX}` }))
    })

    it('should report errors', async () => {
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
        return new Promise((resolve) => setTimeout(resolve, 1000))
      })()

      expect(mockedMetrics.addMetric).toHaveBeenCalledWith(
        OnChainStatusCheckerMetricNames.TotalOrderProcessingErrors,
        MetricUnits.Count,
        1
      )
      expect(mockedMetrics.addMetric).toHaveBeenCalledWith(
        OnChainStatusCheckerMetricNames.TotalProcessedOpenOrders,
        MetricUnits.Count,
        2
      )
    }, 10000)
  })
})
