import { callWithRetry } from '../../../lib/util/network-requests'

describe('callWithRetry test', () => {
  it('should resolve promise', async () => {
    const response = await callWithRetry(async () => Promise.resolve('resolved'))
    expect(response).toEqual('resolved')
  })

  it('should throw error', async () => {
    try {
      await callWithRetry(async () => {
        throw new Error('error.')
      }, 1)
    } catch (e) {
      expect(e).toEqual(Error('error.'))
    }
  })
})
