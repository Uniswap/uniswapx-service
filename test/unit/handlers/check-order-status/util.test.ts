import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { BigNumber, utils } from 'ethers'
import { mock } from 'jest-mock-extended'
import { getWatcher, OrderFillWatcher } from '../../../../lib/handlers/check-order-status/util'

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
  const ORDER_HASH = '0x' + '11'.repeat(32)
  const FILLER = utils.getAddress('0x' + '22'.repeat(20))
  const SWAPPER = utils.getAddress('0x' + '33'.repeat(20))
  const TOKEN_IN = '0x' + '44'.repeat(20)
  const TOKEN_OUT = '0x' + '55'.repeat(20)
  const transferTopic = utils.id('Transfer(address,address,uint256)')
  const transferLog = (token: string, from: string, to: string, amount: number) => ({
    address: token,
    topics: [transferTopic, utils.hexZeroPad(from, 32), utils.hexZeroPad(to, 32)],
    data: utils.hexZeroPad(utils.hexlify(amount), 32),
  })

  function buildWatcher() {
    const provider = new StaticJsonRpcProvider('http://localhost:8545', 1)
    const watcher = new OrderFillWatcher(provider, '0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4')
    const reactor = (watcher as any).reactor
    const queryFilter = jest.spyOn(reactor, 'queryFilter')
    const getTransactionReceipt = jest.spyOn(provider, 'getTransactionReceipt')
    return { watcher, reactor, queryFilter, getTransactionReceipt }
  }

  test('filters Fill logs on the order hash and fetches only that fill receipt', async () => {
    const { watcher, reactor, queryFilter, getTransactionReceipt } = buildWatcher()
    queryFilter.mockResolvedValue([
      {
        transactionHash: '0xtx',
        args: { orderHash: ORDER_HASH, filler: FILLER, swapper: SWAPPER, nonce: BigNumber.from(7) },
      },
    ] as any)
    getTransactionReceipt.mockResolvedValue({
      blockNumber: 123,
      transactionHash: '0xtx',
      logs: [transferLog(TOKEN_IN, SWAPPER, FILLER, 100), transferLog(TOKEN_OUT, FILLER, SWAPPER, 90)],
    } as any)

    const fills = await watcher.getFillInfoForOrder(ORDER_HASH, 10, 20)

    expect(queryFilter).toHaveBeenCalledWith(reactor.filters.Fill(ORDER_HASH), 10, 20)
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
    const { watcher, queryFilter, getTransactionReceipt } = buildWatcher()
    queryFilter.mockResolvedValue([])

    expect(await watcher.getFillInfoForOrder(ORDER_HASH, 10, 20)).toEqual([])
    expect(getTransactionReceipt).not.toHaveBeenCalled()
  })
})
