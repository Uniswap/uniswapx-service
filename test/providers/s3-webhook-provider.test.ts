import { S3Client } from '@aws-sdk/client-s3';
import { WebhookDefinition } from '../../lib/providers/types'
import { S3WebhookConfigurationProvider } from '../../lib/providers/s3-webhook-provider'

describe('S3WebhookProvider test', () => {
  const bucket = 'test-bucket';
  const key = 'test-key';

  function applyMock(endpoints: WebhookDefinition) {
    jest.spyOn(S3Client.prototype, 'send').mockImplementationOnce(() =>
      Promise.resolve({
        Body: {
          transformToString: () => Promise.resolve(JSON.stringify(endpoints)),
        },
      })
    );
  }


  const mockEndpoints = {
    filter: {
      filler: {
        '0x1': [{ url: 'webhook.com/1' }],
      },
      orderStatus: { open: [{ url: 'webhook.com/2' }, { url: 'webhook.com/1' }] },
      swapper: { '0x2': [{ url: 'webhook.com/4' }] },
    },
    registeredWebhook: {}
  }

  const mockEndpoints2 = {
    filter: {
      filler: {
        '0x1': [{ url: 'webhook2.com/1' }],
      },
      orderStatus: { open: [{ url: 'webhook2.com/2' }, { url: 'webhook2.com/1' }] },
      swapper: { '0x2': [{ url: 'webhook2.com/4' }] },
    },
    registeredWebhook: {}
  }

  it('Fetches endpoints', async () => {
    applyMock(mockEndpoints);
    const provider = new S3WebhookConfigurationProvider(bucket, key);
    const endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      swapper: '0x2',
    } as any)
    expect(endpoints).toEqual([{ url: 'webhook.com/1' }, { url: 'webhook.com/2' }, { url: 'webhook.com/4' }])
  });

  it('Caches fetched endpoints', async () => {
    applyMock(mockEndpoints);
    const provider = new S3WebhookConfigurationProvider(bucket, key);
    let endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      swapper: '0x2',
    } as any)
    expect(endpoints).toEqual([{ url: 'webhook.com/1' }, { url: 'webhook.com/2' }, { url: 'webhook.com/4' }])
  });

  it('Refetches after cache expires', async () => {
    applyMock(mockEndpoints);
    const provider = new S3WebhookConfigurationProvider(bucket, key);
    let endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      swapper: '0x2',
    } as any)
    expect(endpoints).toEqual([{ url: 'webhook.com/1' }, { url: 'webhook.com/2' }, { url: 'webhook.com/4' }])

    // update mock endpoints and skip a small bit of time forward
    // should still use the old ones
    applyMock(mockEndpoints2);
    jest.useFakeTimers().setSystemTime(Date.now() + 100);
    endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      swapper: '0x2',
    } as any)
    // should still equal old ones
    expect(endpoints).toEqual([{ url: 'webhook.com/1' }, { url: 'webhook.com/2' }, { url: 'webhook.com/4' }])

    // skip farther forward
    applyMock(mockEndpoints2);
    jest.useFakeTimers().setSystemTime(Date.now() + 1000000);
    endpoints = await provider.getEndpoints({
      filler: '0x1',
      orderStatus: 'open',
      swapper: '0x2',
    } as any)
    // should still equal old ones
    expect(endpoints).toEqual([{ url: 'webhook2.com/1' }, { url: 'webhook2.com/2' }, { url: 'webhook2.com/4' }])
  });
})
