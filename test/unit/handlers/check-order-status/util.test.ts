import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { getWatcher } from '../../../../lib/handlers/check-order-status/util'

describe('getWatcher', () => {
  test('works with OrderType.Dutch', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch)
    expect(watcher).toBeDefined()
  })

  test('works with OrderType.Dutch_V2', () => {
    const watcher = getWatcher(mock<StaticJsonRpcProvider>(), 1, OrderType.Dutch_V2)
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
