import { parseComparisonFilter } from '../../../lib/util/comparison'

describe('Test Comparison filter parsing', () => {
  it('successfully matches comparison filter with single value.', async () => {
    const param = 'gt(123)'
    const res = parseComparisonFilter(param)
    expect(res).toEqual({
      operator: 'gt',
      values: [123],
    })
  })

  it('successfully matches comparison filter with two values.', async () => {
    const param = 'between(1,3)'
    const res = parseComparisonFilter(param)
    expect(res).toEqual({
      operator: 'between',
      values: [1, 3],
    })
  })

  it('throws error if three comma-delimited values are present.', async () => {
    const param = 'between(1,2,3)'
    expect(() => {
      parseComparisonFilter(param)
    }).toThrowError(Error)
  })

  it('throws error if parsed operator is not supported.', async () => {
    const param = 'foo(1234)'
    expect(() => {
      parseComparisonFilter(param)
    }).toThrowError(Error)
  })
})
