import { TABLE_KEY } from '../../../lib/config/dynamodb'
import { OrderEntity, ORDER_STATUS } from '../../../lib/entities'
import { GetOrdersQueryParams } from '../../../lib/handlers/get-orders/schema'
import { DutchIndexMapper } from '../../../lib/repositories/IndexMappers/DutchIndexMapper'
import { MOCK_ORDER_ENTITY } from '../../test-data'

class QueryParamsBuilder {
  constructor(private params: GetOrdersQueryParams = {}) {}

  withFiller(value?: string) {
    this.params.filler = value || '0xFiller'
    return this
  }

  withOfferer(value?: string) {
    this.params.offerer = value || '0xOfferer'
    return this
  }

  withOrderStatus(value?: string) {
    this.params.orderStatus = value || 'open'
    return this
  }

  withChainId(value?: number) {
    this.params.chainId = value || 1
    return this
  }

  public build() {
    return { ...this.params }
  }
}
// queryParams:{
//     limit?: number
//     orderStatus?: string
//     orderHash?: string
//     sortKey?: SORT_FIELDS
//     sort?: string
//     filler?: string
//     cursor?: string
//     chainId?: number
//     desc?: boolean
//     offerer?: string
//     orderHashes?: string[]
// }
describe('DutchIndexMapper', () => {
  const indexMapper: DutchIndexMapper = new DutchIndexMapper()

  describe('getIndexFromParams', () => {
    let queryParamsBuilder: QueryParamsBuilder
    beforeEach(() => {
      queryParamsBuilder = new QueryParamsBuilder()
    })

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
      const order: OrderEntity = {
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
      const order: OrderEntity = {
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
})
