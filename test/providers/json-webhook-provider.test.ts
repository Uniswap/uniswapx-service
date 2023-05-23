import { JsonWebhookProvider } from '../../lib/providers/json-webhook-provider'

describe('JsonWebHookProvider test', () => {
  it('should return registed endpoints', async () => {
    const webhookProvider = JsonWebhookProvider.create({
      filter: {
        filler: {
          '0x1': [{ url: 'webhook.com/1' }],
        },
        orderStatus: { open: [{ url: 'webhook.com/2' }, { url: 'webhook.com/1' }] },
        offerer: { '0x2': [{ url: 'webhook.com/4' }] },
      },
    } as any)
    expect(
      webhookProvider.getEndpoints({
        filler: '0x1',
        orderStatus: 'open',
        offerer: '0x2',
      } as any)
    ).toEqual([{ url: 'webhook.com/1' }, { url: 'webhook.com/2' }, { url: 'webhook.com/4' }])
  })
})
