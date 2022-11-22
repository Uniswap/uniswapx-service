import { GetApiDocsJsonHandler } from '../../lib/handlers/get-api-docs-json/handler'
import OPENAPI_SCHEMA from '../../lib/handlers/get-api-docs-json/schema'
import { HeaderExpectation } from '../utils'

describe('Testing get api docs json handler.', () => {
  // Creating mocks for all the handler dependencies.
  const requestInjectedMock = {
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {}
    },
    getRequestInjected: () => requestInjectedMock,
  }
  const event = {
    queryStringParameters: {},
    body: null,
  }

  const getApiDocsJsonHanlder = new GetApiDocsJsonHandler('get-api-docs-json', injectorPromiseMock)

  it('Testing valid request and response.', async () => {
    const getApiDocsJsonResponse = await getApiDocsJsonHanlder.handler(event as any, {} as any)
    expect(getApiDocsJsonResponse).toMatchObject({
      statusCode: 200,
      body: JSON.stringify(OPENAPI_SCHEMA),
    })
    expect(getApiDocsJsonResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getApiDocsJsonResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType('text/plain')
  })
})
