import Joi from 'joi'

export const PostOrderRequestBodyJoi = Joi.object({
  encodedOrder: Joi.string().required(), // Joi doesn't support 0x-prefixed hex strings
  signature: Joi.string().required(),
  chainId: Joi.number().required(),
  // optional until they are added to the UI
  deadline: Joi.number().optional(),
  offerer: Joi.string().optional(),
  sellToken: Joi.string().optional(),
})

export const PostOrderResponseJoi = Joi.object({
  hash: Joi.string(),
})

export type PostOrderRequestBody = {
  encodedOrder: string
  signature: string
  chainId: number
}

export type PostOrderResponse = {
  hash: string
}
