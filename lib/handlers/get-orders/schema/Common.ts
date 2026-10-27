import Joi from "joi";
import FieldValidator from "../../../util/field-validator";

export const SettledAmountJoi = Joi.object({
    tokenOut: FieldValidator.isValidEthAddress(),
    amountOut: FieldValidator.isValidAmount(),
    tokenIn: FieldValidator.isValidEthAddress(),
    amountIn: FieldValidator.isValidAmount(),
});

export const OrderOutputJoi = Joi.object({
    token: FieldValidator.isValidEthAddress().required(),
    startAmount: FieldValidator.isValidAmount().required(),
    endAmount: FieldValidator.isValidAmount().required(),
    recipient: FieldValidator.isValidEthAddress().required(),
});

export const CommonOrderValidationFields = {
    encodedOrder: FieldValidator.isValidEncodedOrder().required(),
    signature: FieldValidator.isValidSignature().required(),
    orderStatus: FieldValidator.isValidOrderStatus().required(),
    orderHash: FieldValidator.isValidOrderHash().required(),
    chainId: FieldValidator.isValidChainId().required(),
    swapper: FieldValidator.isValidEthAddress().required(),
    txHash: FieldValidator.isValidTxHash(),
    fillBlock: FieldValidator.isValidNumber(),
    fillTimestamp: FieldValidator.isValidNumber(),
    quoteId: FieldValidator.isValidQuoteId(),
    requestId: FieldValidator.isValidRequestId(),
    nonce: FieldValidator.isValidNonce(),
    cosignature: Joi.string(),
    createdAt: Joi.number(),
    settledAmounts: Joi.array().items(SettledAmountJoi),
}


