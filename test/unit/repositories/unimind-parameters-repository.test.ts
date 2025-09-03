import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { mock } from 'jest-mock-extended'
import { DynamoUnimindParametersRepository, UnimindParameters } from '../../../lib/repositories/unimind-parameters-repository'
import { UNIMIND_ALGORITHM_VERSION } from '../../../lib/util/constants'

describe('UnimindParametersRepository', () => {
  const mockDocumentClient = mock<DocumentClient>()

  const mockUnimindParameters: UnimindParameters = {
    pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
    intrinsicValues: JSON.stringify({
      pi: 3.14,
      tau: 4.2,
    }),
    version: UNIMIND_ALGORITHM_VERSION,
    count: 42,
    batchNumber: 0
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('put', () => {
    it('successfully puts unimind parameters', async () => {
      const repository = DynamoUnimindParametersRepository.create(mockDocumentClient)
      mockDocumentClient.put.mockReturnValue({
        promise: () => Promise.resolve({}),
      } as any)
    
      await repository.put(mockUnimindParameters)

      expect(mockDocumentClient.put).toHaveBeenCalledTimes(1)
    })

    it('throws error when put fails', async () => {
      const repository = DynamoUnimindParametersRepository.create(mockDocumentClient)
      const error = new Error('DynamoDB Error')
      mockDocumentClient.put.mockReturnValue({
        promise: () => Promise.reject(error),
      } as any)

      await expect(repository.put(mockUnimindParameters)).rejects.toThrow(error)
    })

    it('throws error when missing required fields', async () => {
      const repository = DynamoUnimindParametersRepository.create(mockDocumentClient)
      
      const incompleteValues = {
        pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
        // missing intrinsicValues
        count: 42
      }

      await expect(repository.put(incompleteValues as any)).rejects.toThrow(
        "'intrinsicValues' is a required field"
      )
      expect(mockDocumentClient.put).not.toHaveBeenCalled()
    })

    it('throws error when missing count field', async () => {
      const repository = DynamoUnimindParametersRepository.create(mockDocumentClient)
      
      const incompleteValues = {
        pair: 'ETH-USDC',
        intrinsicValues: {
          pi: 3.14,
          tau: 4.2,
        },
        // missing count
      }

      await expect(repository.put(incompleteValues as any)).rejects.toThrow(
        "'count' is a required field"
      )
      expect(mockDocumentClient.put).not.toHaveBeenCalled()
    })
  })

  describe('getByPair', () => {
    it('successfully gets unimind parameters by pair', async () => {
      const repository = DynamoUnimindParametersRepository.create(mockDocumentClient)
      mockDocumentClient.get.mockReturnValue({
        promise: () => Promise.resolve({ Item: mockUnimindParameters }),
      } as any)

      const result = await repository.getByPair('0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123')

      expect(result).toEqual(mockUnimindParameters)
      expect(mockDocumentClient.get).toHaveBeenCalledTimes(1)
    })

    it('returns undefined when item not found', async () => {
      const repository = DynamoUnimindParametersRepository.create(mockDocumentClient)
      mockDocumentClient.get.mockReturnValue({
        promise: () => Promise.resolve({ Item: undefined }),
      } as any)

      const result = await repository.getByPair('NONEXISTENT-PAIR')

      expect(result).toBeUndefined()
      expect(mockDocumentClient.get).toHaveBeenCalledTimes(1)
    })
  })
}) 