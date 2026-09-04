import Joi from 'joi'
import swagger from '../../swagger.json'
import { ORDER_STATUS, SORT_FIELDS } from '../../lib/entities'
import { ErrorCode } from '../../lib/handlers/base'
import { GetLimitOrdersQueryParamsJoi, GetOrdersQueryParamsJoi } from '../../lib/handlers/get-orders/schema'
import { GetDutchV2OrderResponseEntryJoi } from '../../lib/handlers/get-orders/schema/GetDutchV2OrderResponse'
import { GetDutchV3OrderResponseEntryJoi } from '../../lib/handlers/get-orders/schema/GetDutchV3OrderResponse'
import { OrderResponseEntryJoi } from '../../lib/handlers/get-orders/schema/GetOrdersResponse'
import { GetPriorityOrderResponseEntryJoi } from '../../lib/handlers/get-orders/schema/GetPriorityOrderResponse'
import { RelayOrderResponseEntryJoi } from '../../lib/handlers/get-orders/schema/GetRelayOrderResponse'
import { SUPPORTED_CHAINS } from '../../lib/util/chain'
import FieldValidator from '../../lib/util/field-validator'

// swagger.json is hand-maintained. These tests pin it to the joi schemas that
// actually validate requests and responses, so the published docs cannot
// silently drift from the deployed API.

/* eslint-disable @typescript-eslint/no-explicit-any */
const spec = swagger as any

function resolveRef(ref: string): any {
  if (!ref.startsWith('#/')) throw new Error(`External $ref not supported: ${ref}`)
  let node: any = spec
  for (const segment of ref.slice(2).split('/')) {
    node = node?.[segment]
    if (node === undefined) throw new Error(`$ref does not resolve: ${ref}`)
  }
  return node
}

function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collectRefs(child, refs))
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') refs.push(value)
      else collectRefs(value, refs)
    }
  }
  return refs
}

function schemaFor(name: string): any {
  const schema = spec.components?.schemas?.[name]
  if (!schema) throw new Error(`components.schemas.${name} is missing from swagger.json`)
  return schema
}

function documentedParameterNames(path: string): string[] {
  const parameters = spec.paths?.[path]?.get?.parameters
  if (!parameters) throw new Error(`No GET parameters documented for ${path}`)
  return parameters.map((p: any) => (p.$ref ? resolveRef(p.$ref) : p).name).sort()
}

// Keys a schema only rejects (`Joi.forbidden()`) or accepts-then-drops (`.strip()`) -- GET
// /orders' retired pagination and sort parameters -- are not part of the contract.
function joiKeys(schema: Joi.Schema): string[] {
  const keys: Record<string, any> = (schema.describe() as any).keys ?? {}
  return Object.keys(keys)
    .filter((key) => keys[key]?.flags?.presence !== 'forbidden' && keys[key]?.flags?.result !== 'strip')
    .sort()
}

function joiRequiredKeys(schema: Joi.Schema): string[] {
  const keys: Record<string, any> = (schema.describe() as any).keys ?? {}
  return Object.keys(keys)
    .filter((key) => keys[key].flags?.presence === 'required')
    .sort()
}

function joiAllowedValues(schema: Joi.Schema): (string | number)[] {
  return [...((schema.describe() as any).allow ?? [])].sort()
}

const ORDER_ENTITY_SCHEMAS: [string, Joi.ObjectSchema][] = [
  ['DutchOrderEntity', OrderResponseEntryJoi],
  ['DutchV2OrderEntity', GetDutchV2OrderResponseEntryJoi],
  ['DutchV3OrderEntity', GetDutchV3OrderResponseEntryJoi],
  ['PriorityOrderEntity', GetPriorityOrderResponseEntryJoi],
  ['RelayOrderEntity', RelayOrderResponseEntryJoi],
]

describe('swagger.json stays in sync with the API', () => {
  // /nonce and POST /order are deliberately undocumented: /nonce is blocked at
  // the public edge and order submission goes through the Trading API (#313).
  it('documents exactly the publicly served endpoints', () => {
    expect(Object.keys(spec.paths).sort()).toEqual(['/limit-orders', '/orders'])
  })

  it('resolves every $ref in the document', () => {
    collectRefs(spec).forEach(resolveRef)
  })

  it('declares every required field as a property', () => {
    const walk = (node: any, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`))
        return
      }
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node.required) && node.properties) {
        for (const field of node.required) {
          if (!(field in node.properties)) {
            throw new Error(`${path} marks "${field}" required but does not declare it as a property`)
          }
        }
      }
      Object.entries(node).forEach(([key, value]) => walk(value, `${path}.${key}`))
    }
    walk(spec, 'swagger')
  })

  it.each([
    ['/orders', GetOrdersQueryParamsJoi],
    ['/limit-orders', GetLimitOrdersQueryParamsJoi],
  ])('documents the exact query parameters accepted by GET %s', (path, schema) => {
    expect(documentedParameterNames(path)).toEqual(joiKeys(schema))
  })

  it('documents pagination and sorting for /limit-orders only', () => {
    const paged = ['cursor', 'desc', 'sort', 'sortKey']
    expect(documentedParameterNames('/limit-orders').filter((p) => paged.includes(p))).toEqual(paged)
    expect(documentedParameterNames('/orders').filter((p) => paged.includes(p))).toEqual([])
  })

  it('lists every supported chain in the ChainId enum', () => {
    const documented = [...schemaFor('ChainId').enum].sort((a: number, b: number) => a - b)
    expect(documented).toEqual([...SUPPORTED_CHAINS].sort((a, b) => a - b))
  })

  it('matches the ORDER_STATUS enum', () => {
    expect([...schemaFor('OrderStatus').enum].sort()).toEqual(Object.values(ORDER_STATUS).sort())
  })

  it('matches the orderType query values accepted by the validator', () => {
    expect([...schemaFor('OrderTypeQuery').enum].sort()).toEqual(
      joiAllowedValues(FieldValidator.isValidGetQueryParamOrderType())
    )
  })

  it('matches the sortKey values accepted by the validator', () => {
    expect([...schemaFor('SortKey').enum].sort()).toEqual(Object.values(SORT_FIELDS).sort())
  })

  it('matches the ErrorCode enum', () => {
    expect([...schemaFor('ErrorCode').enum].sort()).toEqual(Object.values(ErrorCode).sort())
  })

  it.each(ORDER_ENTITY_SCHEMAS)('%s documents the fields of its joi response schema', (name, joiSchema) => {
    expect(Object.keys(schemaFor(name).properties ?? {}).sort()).toEqual(joiKeys(joiSchema))
    expect([...(schemaFor(name).required ?? [])].sort()).toEqual(joiRequiredKeys(joiSchema))
  })

  it('covers every order entity variant in GetOrdersResponse', () => {
    const documented = (schemaFor('GetOrdersResponse').properties.orders.items.oneOf ?? [])
      .map((entry: any) => entry.$ref)
      .sort()
    expect(documented).toEqual(ORDER_ENTITY_SCHEMAS.map(([name]) => `#/components/schemas/${name}`).sort())
  })

  it('documents every order type the API can return', () => {
    const documented = ORDER_ENTITY_SCHEMAS.flatMap(([name]) => schemaFor(name).properties.type.enum ?? [])
    expect(documented.sort()).toEqual(joiAllowedValues(FieldValidator.isValidOrderType()))
  })
})
