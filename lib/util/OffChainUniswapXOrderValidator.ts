import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  DutchOrder,
  DutchOutput,
  NonlinearDutchDecay,
  OrderType,
  PriorityOutput,
  REACTOR_ADDRESS_MAPPING,
  V3DutchOutput,
} from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import Joi from 'joi'
import FieldValidator from './field-validator'
import { OrderValidationResponse } from './OrderValidationResponse'

export type OffChainOrder = DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder

export type OffChainOrderValidatorConfig = {
  getCurrentTime: () => number
  deadlineValidityPeriodSeconds: number
  // The only cosigner a Dutch_V2 or Dutch_V3 order may carry (LABS_COSIGNER).
  cosigner: string
  // The only cosigner a Priority order may carry (LABS_PRIORITY_COSIGNER).
  priorityCosigner: string
  // The limit route: its orders' decayStartTime is not checked against the deadline.
  skipDecayStartTimeValidation?: boolean
}

// One check on an order: the errorString it fails with, or undefined when it passes.
type Check<O> = (order: O) => string | undefined

const UINT256_LIMIT = BigNumber.from(1).shl(256)
const MPS_PER_PRIORITY_FEE_WEI_JOI = Joi.number().min(0)

/**
 * The off-chain checks for a posted order. Each order type runs its own list of checks in
 * order and the first failure is the response; the order of every list, and every
 * errorString, is part of the API (see test/unit/util/order-validator.test.ts).
 */
export class OffChainUniswapXOrderValidator {
  private readonly dutchChecks: Check<DutchOrder>[]
  private readonly dutchV2Checks: Check<CosignedV2DutchOrder>[]
  private readonly dutchV3Checks: Check<CosignedV3DutchOrder>[]
  private readonly priorityChecks: Check<CosignedPriorityOrder>[]

  constructor(config: OffChainOrderValidatorConfig) {
    const { getCurrentTime, deadlineValidityPeriodSeconds } = config
    const cosignerJoi = Joi.string().valid(config.cosigner)
    const priorityCosignerJoi = Joi.string().valid(config.priorityCosigner)

    const checkDeadline: Check<OffChainOrder> = ({ info: { deadline } }) => {
      const now = getCurrentTime()
      if (deadline < now) return 'Deadline must be in the future'
      if (deadline > now + deadlineValidityPeriodSeconds) {
        return `Deadline field invalid: Order expiry cannot be larger than ${
          deadlineValidityPeriodSeconds / 60
        } minutes`
      }
      return undefined
    }

    // Before the per-type checks: the chain, the type's reactor on that chain, the deadline,
    // and, where the type has one, its decayStartTime.
    const placement = <O extends OffChainOrder>(
      orderType: OrderType,
      decayStartTime?: (order: O) => number
    ): Check<O>[] => [
      ({ chainId }) => FieldValidator.isValidChainId().validate(chainId).error?.message,
      ({ chainId, info: { reactor } }) => {
        const expected = REACTOR_ADDRESS_MAPPING[chainId]?.[orderType]
        return !expected || reactor.toLowerCase() != expected.toLowerCase() ? 'Invalid reactor address' : undefined
      },
      checkDeadline,
      ...(decayStartTime && !config.skipDecayStartTimeValidation
        ? [
            (order: O) =>
              decayStartTime(order) > order.info.deadline
                ? 'Invalid decayStartTime: decayStartTime > deadline'
                : undefined,
          ]
        : []),
    ]

    const fields: Check<OffChainOrder>[] = [
      ({ info: { nonce } }) => joiCheck(FieldValidator.isValidNonce(), nonce.toString(), 'Invalid nonce: '),
      ({ info: { swapper } }) => joiCheck(FieldValidator.isValidEthAddress(), swapper, 'Invalid swapper: '),
      // TODO: Once deployed contracts are finalized, we can restrict this
      // to check against a known set of addresses.
      ({ info: { reactor } }) => joiCheck(FieldValidator.isValidEthAddress(), reactor, 'Invalid reactor: '),
      ({ info: { input } }) => joiCheck(FieldValidator.isValidEthAddress(), input.token, 'Invalid input token: '),
    ]

    const checkHash: Check<OffChainOrder> = (order) =>
      joiCheck(FieldValidator.isValidOrderHash(), order.hash(), 'Invalid orderHash: ')

    const checkCosigner: Check<CosignedV2DutchOrder | CosignedV3DutchOrder> = ({ info: { cosigner } }) =>
      joiCheck(cosignerJoi, cosigner, 'Invalid cosigner: ')

    const checkInputOverride: Check<CosignedV2DutchOrder | CosignedV3DutchOrder> = ({ info }) => {
      const { inputOverride } = info.cosignerData
      return !inputOverride.isZero() && inputOverride.gt(info.input.startAmount)
        ? 'Invalid inputOverride > startAmount'
        : undefined
    }

    this.dutchChecks = [
      ...placement<DutchOrder>(OrderType.Dutch, (order) => order.info.decayStartTime),
      ...fields,
      ({ info: { input } }) => checkInputAmount(input.startAmount),
      ({ info: { input } }) => checkInputAmount(input.endAmount),
      ({ info: { outputs } }) => checkOutputs(outputs, checkDutchOutputAmounts),
      checkHash,
    ]

    this.dutchV2Checks = [
      checkCosigner,
      checkInputOverride,
      ...placement<CosignedV2DutchOrder>(OrderType.Dutch_V2, (order) => order.info.cosignerData.decayStartTime),
      ...fields,
      ({ info: { input } }) => checkInputAmount(input.startAmount),
      ({ info: { input } }) => checkInputAmount(input.endAmount),
      ({ info: { outputs } }) => checkOutputs(outputs, checkDutchOutputAmounts),
      ({ info }) => checkOutputOverrides(info.outputs, info.cosignerData.outputOverrides),
      checkHash,
    ]

    this.dutchV3Checks = [
      checkCosigner,
      checkInputOverride,
      ...placement<CosignedV3DutchOrder>(OrderType.Dutch_V3),
      ...fields,
      ({ info: { input } }) => checkInputAmount(input.startAmount),
      ({ info: { input } }) => checkCurve(input.curve),
      ({ info: { input } }) => checkInputAmount(input.maxAmount),
      ({ info: { input } }) => (input.startAmount.gt(input.maxAmount) ? 'Invalid maxAmount < startAmount' : undefined),
      ({ info: { outputs } }) => checkOutputs(outputs, checkV3OutputAmounts),
      ({ info }) => checkOutputOverrides(info.outputs, info.cosignerData.outputOverrides),
      checkHash,
    ]

    this.priorityChecks = [
      ({ info: { cosigner } }) => joiCheck(priorityCosignerJoi, cosigner, 'Invalid priority order cosigner: '),
      ...placement<CosignedPriorityOrder>(OrderType.Priority),
      ...fields,
      ({ info: { input } }) => checkInputAmount(input.amount),
      ({ info: { input } }) => checkMpsPerPriorityFeeWei(input.mpsPerPriorityFeeWei),
      ({ info: { outputs } }) => checkOutputs(outputs, checkPriorityOutputAmounts),
      checkHash,
    ]
  }

  validate(order: OffChainOrder): OrderValidationResponse {
    const errorString = this.firstError(order)
    return errorString === undefined ? { valid: true } : { valid: false, errorString }
  }

  private firstError(order: OffChainOrder): string | undefined {
    if (order instanceof DutchOrder) return firstError(order, this.dutchChecks)
    if (order instanceof CosignedV2DutchOrder) return firstError(order, this.dutchV2Checks)
    if (order instanceof CosignedV3DutchOrder) return firstError(order, this.dutchV3Checks)
    if (order instanceof CosignedPriorityOrder) return firstError(order, this.priorityChecks)
    return 'Invalid orderType'
  }
}

function firstError<T>(value: T, checks: Check<T>[]): string | undefined {
  for (const check of checks) {
    const error = check(value)
    if (error !== undefined) return error
  }
  return undefined
}

// `${prefix}${error}` when `value` fails `schema`; a Joi error prints as "ValidationError: <message>".
function joiCheck(schema: Joi.Schema, value: unknown, prefix: string): string | undefined {
  const error = schema.validate(value).error
  return error ? `${prefix}${error}` : undefined
}

function isValidUint256(value: BigNumber): boolean {
  return value.gte(0) && value.lt(UINT256_LIMIT)
}

function isValidAddress(value: string): boolean {
  return !FieldValidator.isValidEthAddress().validate(value).error
}

function checkInputAmount(amount: BigNumber): string | undefined {
  return isValidUint256(amount) ? undefined : `Invalid input amount: ${amount.toString()}`
}

function checkMpsPerPriorityFeeWei(mpsPerPriorityFeeWei: BigNumber): string | undefined {
  const error = MPS_PER_PRIORITY_FEE_WEI_JOI.validate(mpsPerPriorityFeeWei.toString()).error
  return error ? `Invalid mpsPerPriorityFeeWei: ${error}; must >= 0` : undefined
}

/**
 * Each output's token and recipient, then the type's amount checks, output by output; then
 * every output must pay outputs[0].token. RFQ quotes an order as one tokenOut and a summed
 * amount, so a mixed-token order would be priced against a total that mixes assets. Fee
 * outputs share the swapper output's token, so multi-output orders pass.
 */
function checkOutputs<T extends { token: string; recipient: string }>(
  outputs: readonly T[],
  checkAmounts: Check<T>
): string | undefined {
  if (outputs.length == 0) return 'Invalid number of outputs: 0'
  for (const output of outputs) {
    if (!isValidAddress(output.token)) return `Invalid output token ${output.token}`
    if (!isValidAddress(output.recipient)) return `Invalid recipient ${output.recipient}`
    const error = checkAmounts(output)
    if (error !== undefined) return error
  }
  const expectedToken = outputs[0].token
  const mismatch = outputs.find(({ token }) => token.toLowerCase() != expectedToken.toLowerCase())
  return mismatch ? `Invalid output token ${mismatch.token}: all outputs must use ${expectedToken}` : undefined
}

const checkDutchOutputAmounts: Check<DutchOutput> = ({ startAmount, endAmount }) => {
  if (!isValidUint256(startAmount)) return `Invalid startAmount ${startAmount.toString()}`
  if (!isValidUint256(endAmount)) return `Invalid endAmount ${endAmount.toString()}`
  if (endAmount.gt(startAmount)) return 'Invalid endAmount > startAmount'
  return undefined
}

const checkV3OutputAmounts: Check<V3DutchOutput> = ({ startAmount, minAmount, curve }) => {
  if (!isValidUint256(startAmount)) return `Invalid startAmount ${startAmount.toString()}`
  if (!isValidUint256(minAmount)) return `Invalid minAmount ${minAmount.toString()}`
  if (minAmount.gt(startAmount)) return 'Invalid minAmount > startAmount'
  return checkCurve(curve)
}

// A priority output's amount is reported as its startAmount.
const checkPriorityOutputAmounts: Check<PriorityOutput> = ({ amount, mpsPerPriorityFeeWei }) => {
  if (!isValidUint256(amount)) return `Invalid startAmount ${amount.toString()}`
  return checkMpsPerPriorityFeeWei(mpsPerPriorityFeeWei)
}

/**
 * Mirrors V2DutchOrderReactor._updateWithCosignerAmounts, which reverts with
 * InvalidCosignerOutput on a length mismatch or a non-zero override below startAmount.
 * V3DutchOrderReactor applies the same rule.
 */
function checkOutputOverrides(
  outputs: readonly { startAmount: BigNumber }[],
  outputOverrides: BigNumber[]
): string | undefined {
  if (outputOverrides.length != outputs.length) {
    return `Invalid outputOverrides length ${outputOverrides.length}: expected ${outputs.length}`
  }
  const belowStart = outputs.some(
    ({ startAmount }, i) => !outputOverrides[i].isZero() && outputOverrides[i].lt(startAmount)
  )
  return belowStart ? 'Invalid outputOverride < startAmount' : undefined
}

function checkCurve(curve: NonlinearDutchDecay): string | undefined {
  if (curve.relativeAmounts.length != curve.relativeBlocks.length) {
    return 'Invalid curve: relativeAmounts.length != relativeBlocks.length'
  }
  for (let i = 1; i < curve.relativeBlocks.length; i++) {
    if (curve.relativeBlocks[i] <= curve.relativeBlocks[i - 1]) {
      return 'Invalid curve: relativeBlocks must be strictly increasing'
    }
  }
  return undefined
}
