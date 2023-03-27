import { currentTimestampInSeconds, currentYearMonthDate } from '../../lib/util/time'

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))

describe('current time in seconds test', () => {
  it('should generate an in-range nonce with prefixed gouda bits', () => {
    expect(currentTimestampInSeconds()).toEqual('1577836800')
  })
})

describe('current year month date test', () => {
  it('should generate an in-range nonce with prefixed gouda bits', () => {
    expect(currentYearMonthDate()).toEqual('2020-01-01')
  })
})
