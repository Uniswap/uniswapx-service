import { TABLE_KEY } from '../../../lib/config/dynamodb'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { GET_QUERY_PARAMS } from '../../../lib/handlers/get-orders/schema'
import { OffchainOrderIndexMapper } from '../../../lib/repositories/IndexMappers/OffchainOrderIndexMapper'
import { MOCK_ORDER_ENTITY } from '../../test-data'
import { QueryParamsBuilder } from '../builders/QueryParamsBuilder'

describe('OffchainOrderIndexMapper', () => {
  const indexMapper: OffchainOrderIndexMapper<UniswapXOrderEntity> = new OffchainOrderIndexMapper()
  const queryParamsBuilder = new QueryParamsBuilder()
  describe('getIndexFromParams', () => {
    it('should give filler_offerer_orderStatus index', async () => {
      const queryParams = queryParamsBuilder.withFiller().withOfferer().withOrderStatus().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `0xFiller_0xOfferer_open`,
        index: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
      })
    })

    it('should give chainId_filler index', async () => {
      const queryParams = queryParamsBuilder.withFiller().withChainId().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `1_0xFiller`,
        index: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}`,
      })
    })

    it('should give chainId_orderStatus index', async () => {
      const queryParams = queryParamsBuilder.withOrderStatus().withChainId().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `1_open`,
        index: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}`,
      })
    })

    it('should give chainId_orderStatus_filler index', async () => {
      const queryParams = queryParamsBuilder.withOrderStatus().withChainId().withFiller().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `1_open_0xFiller`,
        index: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}`,
      })
    })

    it('should give filler_orderStatus index', async () => {
      const queryParams = queryParamsBuilder.withOrderStatus().withFiller().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `0xFiller_open`,
        index: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
      })
    })

    it('should give filler_offerer index', async () => {
      const queryParams = queryParamsBuilder.withOfferer().withFiller().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `0xFiller_0xOfferer`,
        index: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
      })
    })

    it('should give offerer_orderStatus index', async () => {
      const queryParams = queryParamsBuilder.withOfferer().withOrderStatus().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `0xOfferer_open`,
        index: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
      })
    })

    it('should give offerer index', async () => {
      const queryParams = queryParamsBuilder.withOfferer().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `0xOfferer`,
        index: `${TABLE_KEY.OFFERER}`,
      })
    })

    it('should give orderStatus index', async () => {
      const queryParams = queryParamsBuilder.withOrderStatus().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `open`,
        index: `${TABLE_KEY.ORDER_STATUS}`,
      })
    })

    it('should give filler index', async () => {
      const queryParams = queryParamsBuilder.withFiller().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: `0xFiller`,
        index: `${TABLE_KEY.FILLER}`,
      })
    })

    it('should give chainId index', async () => {
      const queryParams = queryParamsBuilder.withChainId().build()
      expect(indexMapper.getIndexFromParams(queryParams)).toEqual({
        partitionKey: 1,
        index: `${TABLE_KEY.CHAIN_ID}`,
      })
    })

    it('should give undefined if no index', async () => {
      const queryParams = queryParamsBuilder.build()
      expect(indexMapper.getIndexFromParams(queryParams)).toBeUndefined()
    })
  })

  describe('getIndexFieldsForUpdate', () => {
    it('should give all index fields from order', () => {
      const order: UniswapXOrderEntity = {
        ...MOCK_ORDER_ENTITY,
        orderStatus: ORDER_STATUS.FILLED,
        offerer: '0xOfferer',
        filler: '0xFiller',
        chainId: 5,
      }
      expect(indexMapper.getIndexFieldsForUpdate(order)).toEqual({
        chainId_filler: '5_0xFiller',
        chainId_orderStatus: '5_filled',
        chainId_orderStatus_filler: '5_filled_0xFiller',
        filler_offerer: '0xFiller_0xOfferer',
        filler_offerer_orderStatus: '0xFiller_0xOfferer_filled',
        filler_orderStatus: '0xFiller_filled',
        offerer_orderStatus: '0xOfferer_filled',
      })
    })
  })

  describe('getIndexFieldsForStatusUpdate', () => {
    it('should give all index fields from order', () => {
      const order: UniswapXOrderEntity = {
        ...MOCK_ORDER_ENTITY,
        orderStatus: ORDER_STATUS.OPEN,
        offerer: '0xOfferer',
        filler: '0xFiller',
        chainId: 5,
      }
      expect(indexMapper.getIndexFieldsForStatusUpdate(order, ORDER_STATUS.INSUFFICIENT_FUNDS)).toEqual({
        chainId_orderStatus: '5_insufficient-funds',
        chainId_orderStatus_filler: '5_insufficient-funds_0xFiller',
        filler_offerer_orderStatus: '0xFiller_0xOfferer_insufficient-funds',
        filler_orderStatus: '0xFiller_insufficient-funds',
        offerer_orderStatus: '0xOfferer_insufficient-funds',
        orderStatus: 'insufficient-funds',
      })
    })
  })

  describe('getRequestedParams', () => {
    it('should ignore sort fields', () => {
      const queryParams = queryParamsBuilder.withDesc().withSort().withSortKey().withChainId().build()
      expect(indexMapper.getRequestedParams(queryParams)).toEqual([GET_QUERY_PARAMS.CHAIN_ID])
    })
  })
})
