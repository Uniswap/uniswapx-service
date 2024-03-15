import { SORT_FIELDS } from '../../../lib/entities'
import { QueryParamsBuilder } from './QueryParamsBuilder'

describe('QueryParamsBuilder', () => {
  test('withFiller undefined sets default value', () => {
    const queryParams = new QueryParamsBuilder().withFiller().build()
    expect(queryParams.filler).toEqual('0xFiller')
  })
  test('withFiller set', () => {
    const queryParams = new QueryParamsBuilder().withFiller('other').build()
    expect(queryParams.filler).toEqual('other')
  })

  test('withOfferer undefined sets default value', () => {
    const queryParams = new QueryParamsBuilder().withOfferer().build()
    expect(queryParams.offerer).toEqual('0xOfferer')
  })
  test('withOfferer set', () => {
    const queryParams = new QueryParamsBuilder().withOfferer('other').build()
    expect(queryParams.offerer).toEqual('other')
  })

  test('withOrderStatus undefined sets default value', () => {
    const queryParams = new QueryParamsBuilder().withOrderStatus().build()
    expect(queryParams.orderStatus).toEqual('open')
  })
  test('withOrderStatus set', () => {
    const queryParams = new QueryParamsBuilder().withOrderStatus('filled').build()
    expect(queryParams.orderStatus).toEqual('filled')
  })

  test('withDesc undefined sets default value', () => {
    const queryParams = new QueryParamsBuilder().withDesc().build()
    expect(queryParams.desc).toEqual(true)
  })
  test('withDesc false', () => {
    const queryParams = new QueryParamsBuilder().withDesc(false).build()
    expect(queryParams.desc).toEqual(false)
  })

  test('withSortKey undefined sets default value', () => {
    const queryParams = new QueryParamsBuilder().withSortKey().build()
    expect(queryParams.sortKey).toEqual('createdAt')
  })
  test('withSortKey set', () => {
    //only 1 sort field currently
    const queryParams = new QueryParamsBuilder().withSortKey(SORT_FIELDS.CREATED_AT).build()
    expect(queryParams.sortKey).toEqual('createdAt')
  })

  test('withSort undefined sets default value', () => {
    const queryParams = new QueryParamsBuilder().withSort().build()
    expect(queryParams.sort).toEqual('desc')
  })
  test('withSort set', () => {
    const queryParams = new QueryParamsBuilder().withSort('asc').build()
    expect(queryParams.sort).toEqual('asc')
  })
})
