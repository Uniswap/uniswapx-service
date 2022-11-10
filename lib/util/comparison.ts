import { SORT_REGEX } from './field-validator'

enum COMPARISON_OPERATORS {
  GT = 'gt',
  LT = 'lt',
  GTE = 'gte',
  LTE = 'lte',
  BETWEEN = 'between',
}

type ComparisonFilter = {
  operator: string
  values: number[]
}

export function parseComparisonFilter(queryParam: string | undefined): ComparisonFilter {
  const match = queryParam?.match(SORT_REGEX)
  if (!match || match.length != 4) {
    throw new Error(`Unable to parse operator and value for query param: ${queryParam}`)
  }
  const operator = match[1]

  if (!Object.values(COMPARISON_OPERATORS).includes(operator as COMPARISON_OPERATORS)) {
    throw new Error(`Unsupported comparison operator ${operator} in query param ${queryParam}`)
  }

  const values = match
    .slice(2)
    .map((v) => parseInt(v))
    .filter((v) => !!v)

  return { operator: operator, values: values }
}
