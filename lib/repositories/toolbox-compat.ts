import { DYNAMODB_TYPES } from '../config/dynamodb'

/**
 * The store writes these tables directly, but the GET list queries still read them through
 * dynamodb-toolbox 0.5, and rows written either way must stay identical. So every write here does
 * what toolbox did:
 * - Only the entity's declared attributes are written, strings and numbers coerced to their
 *   declared type, undefined values left out.
 * - A put stamps `_et` (the entity name), `_ct` and `_md` (ISO timestamps).
 * - An update sets `_md`, and `_ct` and `_et` only if the row has none.
 * - A read renames `_et`, `_ct` and `_md` to toolbox's aliases `entity`, `created` and `modified`.
 */

type Attribute =
  | { readonly type: DYNAMODB_TYPES; readonly partitionKey?: undefined }
  // As toolbox allows: a partition key is a string or a number.
  | { readonly type: DYNAMODB_TYPES.STRING | DYNAMODB_TYPES.NUMBER; readonly partitionKey: true }

export type AttributeTypes = Readonly<Record<string, Attribute>>

const ENTITY = '_et'
const CREATED = '_ct'
const MODIFIED = '_md'
const ALIASES: Record<string, string> = { [ENTITY]: 'entity', [CREATED]: 'created', [MODIFIED]: 'modified' }

// toolbox coerces string and number attributes by default, and passes maps and lists as given.
function coerce(type: DYNAMODB_TYPES, value: unknown): unknown {
  if (type === DYNAMODB_TYPES.STRING) return typeof value === 'string' ? value : String(value)
  if (type === DYNAMODB_TYPES.NUMBER) {
    if (typeof value === 'number') return value
    const number = Number(value)
    if (typeof value !== 'string' || value.length === 0 || !Number.isFinite(number)) {
      throw new Error(`Could not convert '${value}' to a number`)
    }
    return number
  }
  return value
}

/** The declared attributes of `fields`, coerced, without undefined values. */
export function declaredAttributes(fields: object, attributes: AttributeTypes): Record<string, unknown> {
  const item: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(fields)) {
    const attribute = attributes[name]
    if (attribute && value !== undefined) {
      item[name] = coerce(attribute.type, value)
    }
  }
  return item
}

export function putItem(
  fields: object,
  attributes: AttributeTypes,
  entityName: string,
  now: Date
): Record<string, unknown> {
  const iso = now.toISOString()
  return { ...declaredAttributes(fields, attributes), [ENTITY]: entityName, [CREATED]: iso, [MODIFIED]: iso }
}

/** SET for each declared, defined, non-key attribute of `fields`, plus toolbox's stamps. */
export function updateExpression(fields: object, attributes: AttributeTypes, entityName: string, now: Date) {
  const set: string[] = []
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(declaredAttributes(fields, attributes))) {
    if (attributes[name].partitionKey) continue
    set.push(`#${name} = :${name}`)
    names[`#${name}`] = name
    values[`:${name}`] = value
  }
  const iso = now.toISOString()
  set.push(
    `#${CREATED} = if_not_exists(#${CREATED}, :${CREATED})`,
    `#${MODIFIED} = :${MODIFIED}`,
    `#${ENTITY} = if_not_exists(#${ENTITY}, :${ENTITY})`
  )
  Object.assign(names, { [`#${CREATED}`]: CREATED, [`#${MODIFIED}`]: MODIFIED, [`#${ENTITY}`]: ENTITY })
  Object.assign(values, { [`:${CREATED}`]: iso, [`:${MODIFIED}`]: iso, [`:${ENTITY}`]: entityName })
  return {
    UpdateExpression: `SET ${set.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }
}

/** A row as toolbox's reads returned it: every attribute as stored, with its stamps aliased. */
export function asToolboxRead(item: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(item)) {
    row[ALIASES[name] ?? name] = value
  }
  return row
}
