import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { mock } from 'jest-mock-extended'
import { DynamoIntrinsicValuesRepository, IntrinsicValues } from '../../../lib/repositories/intrinsic-values-repository'

describe('IntrinsicValuesRepository', () => {
  const mockDocumentClient = mock<DocumentClient>()

  const mockIntrinsicValues: IntrinsicValues = {
    pair: 'ETH-USDC',
    pi: 3.14,
    tau: 4.2,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('put', () => {
    it('successfully puts intrinsic values', async () => {
      const repository = DynamoIntrinsicValuesRepository.create(mockDocumentClient)
      mockDocumentClient.put.mockReturnValue({
        promise: () => Promise.resolve({}),
      } as any)

      await repository.put(mockIntrinsicValues)

      expect(mockDocumentClient.put).toHaveBeenCalledTimes(1)
    })

    it('throws error when put fails', async () => {
      const repository = DynamoIntrinsicValuesRepository.create(mockDocumentClient)
      const error = new Error('DynamoDB Error')
      mockDocumentClient.put.mockReturnValue({
        promise: () => Promise.reject(error),
      } as any)

      await expect(repository.put(mockIntrinsicValues)).rejects.toThrow(error)
    })

    it('throws error when missing required fields', async () => {
      const repository = DynamoIntrinsicValuesRepository.create(mockDocumentClient)
      
      const incompleteValues = {
        pair: 'ETH-USDC',
        // missing pi
        tau: 4.2,
      }

      await expect(repository.put(incompleteValues as any)).rejects.toThrow(
        "'pi' is a required field"
      )
      expect(mockDocumentClient.put).not.toHaveBeenCalled()
    })
  })

  describe('getByPair', () => {
    it('successfully gets intrinsic values by pair', async () => {
      const repository = DynamoIntrinsicValuesRepository.create(mockDocumentClient)
      mockDocumentClient.get.mockReturnValue({
        promise: () => Promise.resolve({ Item: mockIntrinsicValues }),
      } as any)

      const result = await repository.getByPair('ETH-USDC')

      expect(result).toEqual(mockIntrinsicValues)
      expect(mockDocumentClient.get).toHaveBeenCalledTimes(1)
    })

    it('returns undefined when item not found', async () => {
      const repository = DynamoIntrinsicValuesRepository.create(mockDocumentClient)
      mockDocumentClient.get.mockReturnValue({
        promise: () => Promise.resolve({ Item: undefined }),
      } as any)

      const result = await repository.getByPair('NONEXISTENT-PAIR')

      expect(result).toBeUndefined()
      expect(mockDocumentClient.get).toHaveBeenCalledTimes(1)
    })
  })
}) 