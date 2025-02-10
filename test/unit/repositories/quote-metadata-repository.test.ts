import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { mock } from 'jest-mock-extended'
import { DynamoQuoteMetadataRepository, QuoteMetadata } from '../../../lib/repositories/quote-metadata-repository'

describe('QuoteMetadataRepository', () => {
  const mockDocumentClient = mock<DocumentClient>()

  const mockQuoteMetadata: QuoteMetadata = {
    quoteId: 'test-quote-id',
    referencePrice: "21212121",
    priceImpact: 0.21,
    blockNumber: 123456,
    route: {
        quote: "1234",
        quote_gas_adjusted: "5678",
        gas_price_wei: "1234",
        gas_use_estimate_quote: "2345",
        gas_use_estimate: "3456",
        method_parameters: {
            calldata: "0xabcdef",
            value: "1234",
            to: "0abcdef"
        }
    },
    pair: 'ETH-USDC',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('put', () => {
    it('successfully puts quote metadata', async () => {
      const repository = DynamoQuoteMetadataRepository.create(mockDocumentClient)
      mockDocumentClient.put.mockReturnValue({
        promise: () => Promise.resolve({}),
      } as any)

      await repository.put(mockQuoteMetadata)

      expect(mockDocumentClient.put).toHaveBeenCalledTimes(1)
    })

    it('throws error when put fails', async () => {
      const repository = DynamoQuoteMetadataRepository.create(mockDocumentClient)
      const error = new Error('DynamoDB Error')
      mockDocumentClient.put.mockReturnValue({
        promise: () => Promise.reject(error),
      } as any)

      await expect(repository.put(mockQuoteMetadata)).rejects.toThrow(error)
    })

    it('throws error when missing required fields', async () => {
      const repository = DynamoQuoteMetadataRepository.create(mockDocumentClient)
      
      const incompleteValues = {
        quoteId: 'messed-up',
        // missing referencePrice
        priceImpact: 0.21,
      }

      await expect(repository.put(incompleteValues as any)).rejects.toThrow(
        "'referencePrice' is a required field"
      )
      expect(mockDocumentClient.put).not.toHaveBeenCalled()
    })
  })

  describe('getByQuoteId', () => {
    it('successfully gets quote metadata by quoteId', async () => {
      const repository = DynamoQuoteMetadataRepository.create(mockDocumentClient)
      mockDocumentClient.get.mockReturnValue({
        promise: () => Promise.resolve({ Item: mockQuoteMetadata }),
      } as any)

      const result = await repository.getByQuoteId('test-quote-id')

      expect(result).toEqual(mockQuoteMetadata)
      expect(mockDocumentClient.get).toHaveBeenCalledTimes(1)
    })

    it('returns undefined when item not found', async () => {
      const repository = DynamoQuoteMetadataRepository.create(mockDocumentClient)
      mockDocumentClient.get.mockReturnValue({
        promise: () => Promise.resolve({ Item: undefined }),
      } as any)

      const result = await repository.getByQuoteId('the-truth')

      expect(result).toBeUndefined()
      expect(mockDocumentClient.get).toHaveBeenCalledTimes(1)
    })
  })
}) 