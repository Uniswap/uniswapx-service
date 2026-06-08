import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ChainId } from '../../../../lib/util/chain'
import { FILL_CHECK_OVERLAP_BLOCKS_ON, getWatcher } from '../../../../lib/handlers/check-order-status/util'

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

describe('FILL_CHECK_OVERLAP_BLOCKS_ON', () => {
  test('returns prioritized overlap for mainnet', () => {
    expect(FILL_CHECK_OVERLAP_BLOCKS_ON(ChainId.MAINNET)).toEqual(20)
  })

  test('returns prioritized overlap for base', () => {
    expect(FILL_CHECK_OVERLAP_BLOCKS_ON(ChainId.BASE)).toEqual(20)
  })

  test('returns prioritized overlap for arbitrum one', () => {
    expect(FILL_CHECK_OVERLAP_BLOCKS_ON(ChainId.ARBITRUM_ONE)).toEqual(50)
  })

  test('returns default overlap for non-priority chains', () => {
    expect(FILL_CHECK_OVERLAP_BLOCKS_ON(ChainId.POLYGON)).toEqual(20)
  })
})
