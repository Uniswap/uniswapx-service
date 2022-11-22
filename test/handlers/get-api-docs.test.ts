import { GetApiDocsHandler } from '../../lib/handlers/get-api-docs/handler'
import SWAGGER_UI from '../../lib/handlers/get-api-docs/swagger-ui'
import { HeaderExpectation } from '../utils'

describe('Testing get api docs handler.', () => {
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

  const getApiDocsHanlder = new GetApiDocsHandler('get-api-docs', injectorPromiseMock)

  it('Testing valid request and response.', async () => {
    const getApiDocsResponse = await getApiDocsHanlder.handler(event as any, {} as any)
    expect(getApiDocsResponse).toMatchObject({
      statusCode: 200,
      body: SWAGGER_UI,
    })
    expect(getApiDocsResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getApiDocsResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType('text/html')
  })
})
