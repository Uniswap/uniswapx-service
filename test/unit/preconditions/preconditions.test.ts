import { checkDefined } from '../../../lib/preconditions/preconditions'

describe('checkDefined', () => {
  it('throws on null value with message', async () => {
    expect(() => checkDefined(null, 'foo')).toThrow(new Error('foo'))
  })

  it('throws on undefined value with message', async () => {
    expect(() => checkDefined(undefined, 'foo')).toThrow(new Error('foo'))
  })

  it('returns defined value', async () => {
    expect(checkDefined('foo', 'bar')).toEqual('foo')
  })
})
