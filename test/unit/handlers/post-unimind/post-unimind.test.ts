import { Logger } from '@aws-lambda-powertools/logger'
import { mock } from 'jest-mock-extended'
import { HeaderExpectation } from '../../../HeaderExpectation'
import { EVENT_CONTEXT } from '../../fixtures'
import { PostUnimindHandler } from '../../../../lib/handlers/post-unimind/handler'

describe('Testing post unimind handler', () => {
  const mockLog = mock<Logger>()
  const requestInjected = {
    requestId: 'testRequest',
    log: mockLog,
  }

  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {}
    },
    getRequestInjected: () => requestInjected,
  }

  const postUnimindHandler = new PostUnimindHandler('postUnimindHandler', injectorPromiseMock)

  const event = {
    queryStringParameters: {},
    body: null,
  }

  it('Testing valid request and response', async () => {
    const response = await postUnimindHandler.handler(event as any, EVENT_CONTEXT)
    const body = JSON.parse(response.body)
    
    expect(body).toEqual(
      expect.objectContaining({
        pi: expect.any(Number),
        tau: expect.any(Number)
      })
    )
    expect(response.statusCode).toBe(200)

    expect(response.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(response.headers)
    headerExpectation
      .toAllowAllOrigin()
      .toAllowCredentials()
      .toReturnJsonContentType()
  })

  it('Returns correct CORS headers', async () => {
    const response = await postUnimindHandler.handler(event as any, EVENT_CONTEXT)
    
    expect(response.headers).toEqual({
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    })
  })
}) 