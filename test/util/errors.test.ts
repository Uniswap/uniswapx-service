import { rejectAfterDelay } from '../../lib/util/errors'

describe('rejectAfterDelay test', () => {
  it('should return promise with delay', async () => {
    try {
      await Promise.resolve(rejectAfterDelay(100))
    } catch (e) {
      expect(e).toEqual(Error('Request timed out.'))
    }
  })
})
