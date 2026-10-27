import { DYNAMODB_TYPES } from '../../../lib/config/dynamodb'
import {
  asToolboxRead,
  AttributeTypes,
  declaredAttributes,
  putItem,
  updateExpression,
} from '../../../lib/repositories/toolbox-compat'

const ATTRIBUTES: AttributeTypes = {
  orderHash: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
  nonce: { type: DYNAMODB_TYPES.STRING },
  createdAt: { type: DYNAMODB_TYPES.NUMBER },
  outputs: { type: DYNAMODB_TYPES.LIST },
}
const NOW = new Date('2100-01-01T00:00:00.000Z')

describe('declaredAttributes', () => {
  it('coerces strings and numbers to their declared type, as toolbox did', () => {
    expect(declaredAttributes({ nonce: 7, createdAt: '4102444800' }, ATTRIBUTES)).toEqual({
      nonce: '7',
      createdAt: 4102444800,
    })
  })

  it('drops undeclared attributes and undefined values', () => {
    expect(declaredAttributes({ orderHash: '0x01', cosignerData: {}, nonce: undefined }, ATTRIBUTES)).toEqual({
      orderHash: '0x01',
    })
  })

  it('passes lists as given', () => {
    const outputs = [{ token: '0x02' }]
    expect(declaredAttributes({ outputs }, ATTRIBUTES)).toEqual({ outputs })
  })

  it.each([[''], ['abc'], [[1]]])('rejects %p for a number attribute', (createdAt) => {
    expect(() => declaredAttributes({ createdAt }, ATTRIBUTES)).toThrow('Could not convert')
  })
})

describe('putItem', () => {
  it('stamps the entity name and both timestamps', () => {
    expect(putItem({ orderHash: '0x01' }, ATTRIBUTES, 'Order', NOW)).toEqual({
      orderHash: '0x01',
      _et: 'Order',
      _ct: '2100-01-01T00:00:00.000Z',
      _md: '2100-01-01T00:00:00.000Z',
    })
  })
})

describe('updateExpression', () => {
  it('sets each field but the key, always sets _md, and sets _ct and _et only if absent', () => {
    expect(updateExpression({ orderHash: '0x01', nonce: '9', createdAt: undefined }, ATTRIBUTES, 'Nonce', NOW)).toEqual(
      {
        UpdateExpression:
          'SET #nonce = :nonce, #_ct = if_not_exists(#_ct, :_ct), #_md = :_md, #_et = if_not_exists(#_et, :_et)',
        ExpressionAttributeNames: { '#nonce': 'nonce', '#_ct': '_ct', '#_md': '_md', '#_et': '_et' },
        ExpressionAttributeValues: {
          ':nonce': '9',
          ':_ct': '2100-01-01T00:00:00.000Z',
          ':_md': '2100-01-01T00:00:00.000Z',
          ':_et': 'Nonce',
        },
      }
    )
  })
})

describe('asToolboxRead', () => {
  it("renames toolbox's stamps to its aliases and passes everything else through", () => {
    expect(asToolboxRead({ orderHash: '0x01', _et: 'Order', _ct: 'c', _md: 'm', extra: 1 })).toEqual({
      orderHash: '0x01',
      entity: 'Order',
      created: 'c',
      modified: 'm',
      extra: 1,
    })
  })
})
