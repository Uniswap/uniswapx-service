import { GetDocsHandler } from '../../../lib/handlers/get-docs/GetDocsHandler'
import schema from '../../../swagger.json'
import { HeaderExpectation } from '../../HeaderExpectation'

describe('Testing get api docs json handler.', () => {
  const event = {
    queryStringParameters: {},
    body: null,
  }

  const getDocsHandler = new GetDocsHandler('get-api-docs')

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
