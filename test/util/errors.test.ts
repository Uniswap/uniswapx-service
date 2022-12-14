import { logAndThrowError } from '../../lib/util/errors'

describe('logAndThrowError test', () => {
  it('should log error message and throw error', () => {
    const mockLog = { error: jest.fn() }
    expect(() => {
      logAndThrowError({ mock: 'mock' }, 'Error is happening', mockLog as any)
    }).toThrowError('Error is happening')
    expect(mockLog.error).toBeCalledWith({ mock: 'mock' }, 'Error is happening')
  })
})
