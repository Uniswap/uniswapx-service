import { calculateDutchRetryWaitSeconds } from '../../../../lib/handlers/check-order-status/util'

describe('calculateDutchRetryWaitSeconds', () => {
  it('should do exponential backoff when retry count > 300', async () => {
    const response = calculateDutchRetryWaitSeconds(1, 301)
    expect(response).toEqual(13)
  })

  it('should do exponential backoff when retry count > 300', async () => {
    const response = calculateDutchRetryWaitSeconds(1, 350)
    expect(response).toEqual(138)
  })

  it('should cap exponential backoff when wait interval reaches 18000 seconds', async () => {
    const response = calculateDutchRetryWaitSeconds(1, 501)
    expect(response).toEqual(18000)
  })
})
