import { JsonWebhookProvider } from '../../lib/providers/json-webhook-provider'

describe('JsonWebHookProvider test', () => {
  it('should return registed endpoints', async () => {
    const webhookProvider = JsonWebhookProvider.create({
      filter: {
        filler: {
          '0x1': ['webhook.com/1'],
        },
        orderStatus: { unverified: ['webhook.com/2', 'webhook.com/1'] },
        sellToken: { weth: ['webhook.com/3'] },
        offerer: { '0x2': ['webhook.com/4'] },
      },
    } as any)
    expect(
      webhookProvider.getEndpoints({
        filler: '0x1',
        orderStatus: 'unverified',
        sellToken: 'weth',
        offerer: '0x2',
      } as any)
    ).toEqual(new Set(['webhook.com/1', 'webhook.com/2', 'webhook.com/3', 'webhook.com/4']))
  })
})
