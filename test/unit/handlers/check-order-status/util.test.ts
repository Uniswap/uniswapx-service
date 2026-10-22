import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { BigNumber, utils } from 'ethers'
import { mock } from 'jest-mock-extended'
import {
  getWatcher,
  MAX_FILL_LOOKUP_BLOCK_RANGE,
  OrderFillWatcher,
} from '../../../../lib/handlers/check-order-status/util'

describe('getWatcher', () => {
  test('works with OrderType.Dutch', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch)
    expect(watcher).toBeDefined()
  })

  test('works with OrderType.Dutch_V2', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch_V2)
    expect(watcher).toBeDefined()
  })

  test('works with OrderType.Dutch_V3', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 42161, OrderType.Dutch_V3)
    expect(watcher).toBeDefined()
  })

  test('works with OrderType.Limit', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Limit)
    expect(watcher).toBeDefined()
  })

  test('caches already used UniswapXEventWatcher', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch)
    const watcher2 = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch)

    expect(watcher).toBe(watcher2)
  })

  test('caches Dutch and Limit as the same', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch)
    const watcher2 = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Limit)

    expect(watcher).toBe(watcher2)
  })

  test('does not mix up cached values', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch)
    const watcher2 = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch_V2)

    expect(watcher).not.toBe(watcher2)
  })

  test('does not mix up cached chainIds', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch)
    const watcher2 = getWatcher(mock<StaticJsonRpcProvider>(), 137, OrderType.Dutch)

    expect(watcher).not.toBe(watcher2)
  })

  test('throws an error with no reactor mapping', () => {
    expect(() => {
      getWatcher(mock<StaticJsonRpcProvider>(), 1, 'someOtherType' as OrderType)
    }).toThrow(`No Reactor Address Defined in UniswapX SDK for chainId:1, orderType:someOtherType`)
  })
})

describe('OrderFillWatcher.getFillInfoForOrder', () => {
  const REACTOR = '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4'
  const ORDER_HASH = '0x' + '11'.repeat(32)
  const FILLER = utils.getAddress('0x' + '22'.repeat(20))
  const SWAPPER = utils.getAddress('0x' + '33'.repeat(20))
  const TOKEN_IN = '0x' + '44'.repeat(20)
  const TOKEN_OUT = '0x' + '55'.repeat(20)
  const fillTopic = utils.id('Fill(bytes32,address,address,uint256)')
  const transferTopic = utils.id('Transfer(address,address,uint256)')
  const transferLog = (token: string, from: string, to: string, amount: number) => ({
    address: token,
    topics: [transferTopic, utils.hexZeroPad(from, 32), utils.hexZeroPad(to, 32)],
    data: utils.hexZeroPad(utils.hexlify(amount), 32),
  })
  // Raw Fill log as eth_getLogs returns it; the contract decodes it into args.
  const fillLog = {
    address: REACTOR,
    blockNumber: 123,
    blockHash: '0x' + '66'.repeat(32),
    transactionIndex: 0,
    removed: false,
    transactionHash: '0xtx',
    logIndex: 0,
    topics: [fillTopic, ORDER_HASH, utils.hexZeroPad(FILLER, 32), utils.hexZeroPad(SWAPPER, 32)],
    data: utils.hexZeroPad(utils.hexlify(7), 32),
  }
  const orderFillFilter = (fromBlock: number, toBlock: number) => ({
    address: REACTOR,
    topics: [fillTopic, ORDER_HASH],
    fromBlock,
    toBlock,
  })

  function buildWatcher() {
    const provider = new StaticJsonRpcProvider('http://localhost:8545', 1)
    const watcher = new OrderFillWatcher(provider, REACTOR)
    const getLogs = jest.spyOn(provider, 'getLogs')
    const getTransactionReceipt = jest.spyOn(provider, 'getTransactionReceipt')
    return { watcher, getLogs, getTransactionReceipt }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('filters Fill logs on the order hash and fetches only that fill receipt', async () => {
    const { watcher, getLogs, getTransactionReceipt } = buildWatcher()
    getLogs.mockResolvedValue([fillLog])
    getTransactionReceipt.mockResolvedValue({
      blockNumber: 123,
      transactionHash: '0xtx',
      logs: [transferLog(TOKEN_IN, SWAPPER, FILLER, 100), transferLog(TOKEN_OUT, FILLER, SWAPPER, 90)],
    } as never)

    const fills = await watcher.getFillInfoForOrder(ORDER_HASH, 10, 20)

    expect(getLogs).toHaveBeenCalledTimes(1)
    expect(getLogs).toHaveBeenCalledWith(orderFillFilter(10, 20))
    expect(getTransactionReceipt).toHaveBeenCalledTimes(1)
    expect(getTransactionReceipt).toHaveBeenCalledWith('0xtx')
    expect(fills).toHaveLength(1)
    expect(fills[0]).toMatchObject({
      orderHash: ORDER_HASH,
      filler: FILLER,
      swapper: SWAPPER,
      blockNumber: 123,
      txHash: '0xtx',
    })
    expect(fills[0].nonce.toNumber()).toEqual(7)
    expect(fills[0].inputs).toEqual([{ token: TOKEN_IN, amount: BigNumber.from(100) }])
    expect(fills[0].outputs).toEqual([{ token: TOKEN_OUT, amount: BigNumber.from(90) }])
  })

  test('returns no fills and fetches no receipts when the order has no Fill log', async () => {
    const { watcher, getLogs, getTransactionReceipt } = buildWatcher()
    getLogs.mockResolvedValue([])

    expect(await watcher.getFillInfoForOrder(ORDER_HASH, 10, 20)).toEqual([])
    expect(getTransactionReceipt).not.toHaveBeenCalled()
  })

  test('splits a wide range into capped getLogs calls, newest range first', async () => {
    const { watcher, getLogs } = buildWatcher()
    getLogs.mockResolvedValue([])
    const fromBlock = 1_000
    const toBlock = fromBlock + 2 * MAX_FILL_LOOKUP_BLOCK_RANGE + 499

    await watcher.getFillInfoForOrder(ORDER_HASH, fromBlock, toBlock)

    expect(getLogs.mock.calls.map(([filter]) => filter)).toEqual([
      orderFillFilter(toBlock - MAX_FILL_LOOKUP_BLOCK_RANGE + 1, toBlock),
      orderFillFilter(toBlock - 2 * MAX_FILL_LOOKUP_BLOCK_RANGE + 1, toBlock - MAX_FILL_LOOKUP_BLOCK_RANGE),
      orderFillFilter(fromBlock, toBlock - 2 * MAX_FILL_LOOKUP_BLOCK_RANGE),
    ])
  })

  test('stops at the first range that contains the fill', async () => {
    const { watcher, getLogs, getTransactionReceipt } = buildWatcher()
    getLogs.mockResolvedValueOnce([]).mockResolvedValueOnce([fillLog])
    getTransactionReceipt.mockResolvedValue({ blockNumber: 123, transactionHash: '0xtx', logs: [] } as never)

    const fills = await watcher.getFillInfoForOrder(ORDER_HASH, 0, 3 * MAX_FILL_LOOKUP_BLOCK_RANGE)

    expect(getLogs).toHaveBeenCalledTimes(2)
    expect(fills).toHaveLength(1)
  })

  test('throws when the fill receipt is not available yet, so the state machine retries', async () => {
    const { watcher, getLogs, getTransactionReceipt } = buildWatcher()
    getLogs.mockResolvedValue([fillLog])
    getTransactionReceipt.mockResolvedValue(null as never)

    await expect(watcher.getFillInfoForOrder(ORDER_HASH, 10, 20)).rejects.toThrow('receipt not yet available')
  })
})
