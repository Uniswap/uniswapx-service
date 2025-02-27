import Joi from "joi";
import FieldValidator from "../../../util/field-validator";

export const SettledAmountsValidation = Joi.array().items(
    Joi.object({
        tokenOut: FieldValidator.isValidEthAddress(),
        amountOut: FieldValidator.isValidAmount(),
        tokenIn: FieldValidator.isValidEthAddress(),
        amountIn: FieldValidator.isValidAmount(),
    })
);

export const RouteValidation = Joi.object({
    quote: FieldValidator.isValidAmount(),
    quoteGasAdjusted: FieldValidator.isValidAmount(),
    gasPriceWei: FieldValidator.isValidAmount(),
    gasUseEstimateQuote: FieldValidator.isValidAmount(),
    gasUseEstimate: FieldValidator.isValidAmount(),
    methodParameters: Joi.object({
        calldata: Joi.string(),
        value: Joi.string(),
        to: FieldValidator.isValidEthAddress(),
    }),
})

export const CommonOrderValidationFields = {
    encodedOrder: FieldValidator.isValidEncodedOrder().required(),
    signature: FieldValidator.isValidSignature().required(),
    orderStatus: FieldValidator.isValidOrderStatus().required(),
    orderHash: FieldValidator.isValidOrderHash().required(),
    chainId: FieldValidator.isValidChainId().required(),
    swapper: FieldValidator.isValidEthAddress().required(),
    txHash: FieldValidator.isValidTxHash(),
    quoteId: FieldValidator.isValidQuoteId(),
    requestId: FieldValidator.isValidRequestId(),
    nonce: FieldValidator.isValidNonce(),
    cosignature: Joi.string(),
    createdAt: Joi.number(),
    settledAmounts: SettledAmountsValidation,
    route: RouteValidation,
}


