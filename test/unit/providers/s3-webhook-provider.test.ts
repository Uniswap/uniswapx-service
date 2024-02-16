import { S3Client } from '@aws-sdk/client-s3'
import { findEndpointsMatchingFilter } from '../../../lib/providers/json-webhook-provider'
import { S3WebhookConfigurationProvider } from '../../../lib/providers/s3-webhook-provider'
import { WebhookDefinition } from '../../../lib/providers/types'
import { ORDER_TYPE } from '../../../lib/repositories/base'

describe('S3WebhookProvider test', () => {
  const bucket = 'test-bucket'
  const key = 'test-key'

  function applyMock(endpoints: WebhookDefinition) {
    jest.spyOn(S3Client.prototype, 'send').mockImplementationOnce(() =>
      Promise.resolve({
        Body: {
          transformToString: () => Promise.resolve(JSON.stringify(endpoints)),
        },
      })
    )
  }

  const mockEndpoints = {
    filter: {
      filler: {
        '0x1': [{ url: 'webhook.com/1' }],
      },
      orderStatus: { open: [{ url: 'webhook.com/2' }, { url: 'webhook.com/1' }] },
      offerer: { '0x2': [{ url: 'webhook.com/4' }] },
    },
    ['*']: [{ url: 'webhook.com/0' }],
    registeredWebhook: {},
  }

  const mockEndpoints2 = {
    filter: {
      filler: {
        '0x1': [{ url: 'webhook2.com/1' }],
      },
      orderStatus: { open: [{ url: 'webhook2.com/2' }, { url: 'webhook2.com/1' }] },
      offerer: { '0x2': [{ url: 'webhook2.com/4' }] },
    },
    ['*']: [{ url: 'webhook.com/0' }],
    registeredWebhook: {},
  }

  it('Fetches endpoints', async () => {
    applyMock(mockEndpoints)
    const provider = new S3WebhookConfigurationProvider(bucket, key)
    const endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      offerer: '0x2',
    })
    expect(endpoints).toEqual([
      { url: 'webhook.com/0' },
      { url: 'webhook.com/1' },
      { url: 'webhook.com/2' },
      { url: 'webhook.com/4' },
    ])
  })

  it('Caches fetched endpoints', async () => {
    applyMock(mockEndpoints)
    const provider = new S3WebhookConfigurationProvider(bucket, key)
    const endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      offerer: '0x2',
    })
    expect(endpoints).toEqual([
      { url: 'webhook.com/0' },
      { url: 'webhook.com/1' },
      { url: 'webhook.com/2' },
      { url: 'webhook.com/4' },
    ])
  })

  it('Refetches after cache expires', async () => {
    applyMock(mockEndpoints)
    const provider = new S3WebhookConfigurationProvider(bucket, key)
    let endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      offerer: '0x2',
    })
    expect(endpoints).toEqual([
      { url: 'webhook.com/0' },
      { url: 'webhook.com/1' },
      { url: 'webhook.com/2' },
      { url: 'webhook.com/4' },
    ])

    // update mock endpoints and skip a small bit of time forward
    // should still use the old ones
    applyMock(mockEndpoints2)
    jest.useFakeTimers().setSystemTime(Date.now() + 100)
    endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      offerer: '0x2',
    })
    // should still equal old ones
    expect(endpoints).toEqual([
      { url: 'webhook.com/0' },
      { url: 'webhook.com/1' },
      { url: 'webhook.com/2' },
      { url: 'webhook.com/4' },
    ])

    // skip farther forward
    applyMock(mockEndpoints2)
    jest.useFakeTimers().setSystemTime(Date.now() + 1000000)
    endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      offerer: '0x2',
    })
    // should still equal old ones
    expect(endpoints).toEqual([
      { url: 'webhook.com/0' },
      { url: 'webhook2.com/1' },
      { url: 'webhook2.com/2' },
      { url: 'webhook2.com/4' },
    ])
  })

  describe('findEndpointsMatchingFilter', () => {
    describe('OrderType', () => {
      it('Correctly matches when orderType is undefined', async () => {
        let endpoints = findEndpointsMatchingFilter(
          {
            filler: '0x1',
            orderStatus: 'open',
            offerer: '0x2',
            orderType: undefined,
          },
          mockEndpoints
        )
        expect(endpoints).toEqual([
          { url: 'webhook.com/0' },
          { url: 'webhook.com/1' },
          { url: 'webhook.com/2' },
          { url: 'webhook.com/4' },
        ])
      })

      it('Correctly matches when orderType is Dutch', async () => {
        let endpoints = findEndpointsMatchingFilter(
          {
            filler: '0x1',
            orderStatus: 'open',
            offerer: '0x2',
            orderType: ORDER_TYPE.DUTCH,
          },
          mockEndpoints
        )
        expect(endpoints).toEqual([
          { url: 'webhook.com/0' },
          { url: 'webhook.com/1' },
          { url: 'webhook.com/2' },
          { url: 'webhook.com/4' },
        ])
      })

      it('Only adds * webhooks when OrderType is LimitOrder', async () => {
        let endpoints = findEndpointsMatchingFilter(
          {
            filler: '0x1',
            orderStatus: 'open',
            offerer: '0x2',
            orderType: ORDER_TYPE.LIMIT,
          },
          mockEndpoints
        )
        expect(endpoints).toEqual([{ url: 'webhook.com/0' }])
      })
    })
  })
})
