import { APIGatewayProxyEvent } from 'aws-lambda'
import { redactEvent } from '../../../../lib/handlers/base/api-handler'

describe('redactEvent', () => {
  const SOURCE_IP = '203.0.113.42'
  const FORWARDED_IP = '198.51.100.7'

  const event = {
    resource: '/dutch-auction/order',
    path: '/dutch-auction/order',
    httpMethod: 'POST',
    pathParameters: null,
    queryStringParameters: { chainId: '1' },
    body: '{"encodedOrder":"0xabc","signature":"0xdef","chainId":1}',
    isBase64Encoded: false,
    headers: {
      'X-Forwarded-For': FORWARDED_IP,
      'x-real-ip': FORWARDED_IP,
      'CF-Connecting-IP': FORWARDED_IP,
      'User-Agent': 'Mozilla/5.0',
      'x-api-key': 'super-secret-key',
    },
    multiValueHeaders: {
      'X-Forwarded-For': [FORWARDED_IP],
    },
    requestContext: {
      requestId: 'request-id-1',
      path: '/prod/dutch-auction/order',
      stage: 'prod',
      resourcePath: '/dutch-auction/order',
      httpMethod: 'POST',
      requestTimeEpoch: 1700000000000,
      identity: {
        sourceIp: SOURCE_IP,
        userAgent: 'Mozilla/5.0',
        caller: 'caller-id',
        user: 'user-id',
      },
    },
  } as unknown as APIGatewayProxyEvent

  it('keeps the fields needed to debug a request', () => {
    expect(redactEvent(event)).toEqual({
      resource: '/dutch-auction/order',
      path: '/dutch-auction/order',
      httpMethod: 'POST',
      pathParameters: null,
      queryStringParameters: { chainId: '1' },
      body: '{"encodedOrder":"0xabc","signature":"0xdef","chainId":1}',
      isBase64Encoded: false,
      requestContext: {
        requestId: 'request-id-1',
        path: '/prod/dutch-auction/order',
        stage: 'prod',
        resourcePath: '/dutch-auction/order',
        httpMethod: 'POST',
        requestTimeEpoch: 1700000000000,
      },
    })
  })

  it('drops every client IP, headers, and requestContext.identity', () => {
    const serialized = JSON.stringify(redactEvent(event))

    expect(serialized).not.toContain(SOURCE_IP)
    expect(serialized).not.toContain(FORWARDED_IP)
    expect(serialized).not.toContain('super-secret-key')

    const redacted = redactEvent(event) as Record<string, unknown>
    expect(redacted.headers).toBeUndefined()
    expect(redacted.multiValueHeaders).toBeUndefined()
    expect((redacted.requestContext as Record<string, unknown>).identity).toBeUndefined()
  })

  it('tolerates a missing requestContext', () => {
    expect(() => redactEvent({} as APIGatewayProxyEvent)).not.toThrow()
  })
})
