/* eslint-disable */
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import {
  EventWatcher,
  OrderType,
  OrderValidation,
  OrderValidator,
  REACTOR_ADDRESS_MAPPING,
} from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { BigNumber } from 'ethers'
import { BATCH_READ_MAX, OnChainStatusChecker } from '../../lib/compute/OnChainStatusChecker'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities'
import { log } from '../../lib/Logging'
import { LimitOrdersRepository } from '../../lib/repositories/limit-orders-repository'

const MOCK_ORDER_HASH = '0xc57af022b96e1cb0da0267c15f1d45cdfccf57cfeb8b33869bb50d7f478ab203'
let MOCK_ENCODED_ORDER =
  '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000644844ea000000000000000000000000000000000000000000000000000000006448454e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000cf7ed3acca5a467e9e704c703e8d87f634fb0fc90000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f051200000000000000000000000079cbd6e23db4b71288d4273cfe9e4c6f729838900000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000006448454e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000dc64a140aa3e981100a9beca4e685f962f0cf6c90000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000c7d713b49da000000000000000000000000000079cbd6e23db4b71288d4273cfe9e4c6f72983890'
const MOCK_SIGNATURE =
  '0x5cb4a416206783ec0939d40258f7ed6f2b3d68cb5e3645a0e5460b1524055d6e505996cbeac2240edf0fdd2827bd35a8f673a34a17563b1e0d8c8cdef6d93cc61b'
const MOCK_ORDER_ENTITY: OrderEntity = {
  encodedOrder: MOCK_ENCODED_ORDER,
  signature: MOCK_SIGNATURE,
  nonce: '0xnonce',
  orderHash: MOCK_ORDER_HASH,
  offerer: '0xofferer',
  orderStatus: ORDER_STATUS.OPEN,
  type: OrderType.Dutch,
  chainId: 1,
  reactor: REACTOR_ADDRESS_MAPPING[1][OrderType.Dutch],
  decayStartTime: 1,
  decayEndTime: 2,
  deadline: 3,
  input: {
    token: '0xinput',
    startAmount: '1000000000000000000',
    endAmount: '1000000000000000000',
  },
  outputs: [
    {
      token: '0xoutput',
      startAmount: '2000000000000000000',
      endAmount: '1000000000000000000',
      recipient: '0xrecipient',
    },
  ],
}

const dynamoConfig = {
  convertEmptyValues: true,
  endpoint: 'localhost:8000',
  region: 'local-env',
  sslEnabled: false,
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
}

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = LimitOrdersRepository.create(documentClient)

describe.only('OnChainStatusChecker', () => {
  const mockedBlockNumber = 0
  const getFillEventsMock = jest.fn()
  const getFillInfoMock = jest.fn()

  const providerMock = jest.fn().mockReturnValue(mockedBlockNumber)
  const getTransactionMock = jest.fn()

  describe('Database Integration', () => {
    let watcherSpy: jest.SpyInstance<EventWatcher, [provider: StaticJsonRpcProvider, chainId: number]>,
      providerSpy: jest.SpyInstance<StaticJsonRpcProvider, [chainId: number]>,
      validatorSpy: jest.SpyInstance<OrderValidator, [provider: StaticJsonRpcProvider, chainId: number]>,
      statusChecker: OnChainStatusChecker

    afterEach(() => {
      statusChecker?.stop()
    })

    beforeEach(() => {
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
      statusChecker.checkStatus()

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
      statusChecker.checkStatus()

      await (async () => {
        return new Promise((resolve) => setTimeout(resolve, 1000))
      })()

      expect(checkStatusSpy).toHaveBeenCalledTimes(BATCH_READ_MAX + 1)
      expect(checkStatusSpy).toHaveBeenCalledWith(expect.objectContaining({ orderHash: `0x${BATCH_READ_MAX}` }))
    })
  })
})
