import { GetDocsHandler } from '../../../lib/handlers/get-docs/GetDocsHandler'
import schema from '../../../swagger.json'
import { HeaderExpectation } from '../../HeaderExpectation'

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

  const getDocsHandler = new GetDocsHandler('get-api-docs', injectorPromiseMock)

  it('Testing valid request and response.', async () => {
    const getApiDocsJsonResponse = await getDocsHandler.handler(event as any, {} as any)
    expect(getApiDocsJsonResponse).toMatchObject({
      statusCode: 200,
      body: JSON.stringify(schema),
    })
    expect(getApiDocsJsonResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getApiDocsJsonResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })
})
