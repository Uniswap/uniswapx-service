import { ORDER_STATUS } from '../../lib/entities'
import FieldValidator from '../../lib/util/field-validator'

describe('Testing each field on the FieldValidator class.', () => {
  describe('Testing createdAt field.', () => {
    it('should validate field.', async () => {
      const currentTime = new Date().getTime()
      expect(FieldValidator.isValidCreatedAt().validate(currentTime)).toEqual({ value: currentTime })
    })

    it('should invalidate field.', async () => {
      const validatedField = FieldValidator.isValidCreatedAt().validate('NOT_TIME')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be a number')
    })
  })

  describe('Testing orderStatus field.', () => {
    it('should validate field.', async () => {
      expect(FieldValidator.isValidOrderStatus().validate(ORDER_STATUS.OPEN)).toEqual({ value: ORDER_STATUS.OPEN })
    })

    it('should invalidate field.', async () => {
      const validatedField = FieldValidator.isValidOrderStatus().validate('NOT_A_VALID_STATUS')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        '"value" must be one of [open, filled, cancelled, expired, error, unverified]'
      )
    })
  })

  describe('Testing orderHash field.', () => {
    it('should validate field.', async () => {
      const orderHash = '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae3'
      expect(FieldValidator.isValidOrderHash().validate(orderHash)).toEqual({ value: orderHash })
    })

    it('should invalidate field.', async () => {
      const invalidOrderHash = '0xdeadbeef'
      const validatedField = FieldValidator.isValidOrderHash().validate(invalidOrderHash)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" with value "${invalidOrderHash}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{64}$/`
      )
    })
  })

  describe('Testing signature field.', () => {
    it('should validate field.', async () => {
      const signature =
        '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414'
      expect(FieldValidator.isValidSignature().validate(signature)).toEqual({ value: signature })
    })

    it('should invalidate field.', async () => {
      const invalidSignature = '0xsignaturetooshort'
      const validatedField = FieldValidator.isValidSignature().validate(invalidSignature)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" with value "${invalidSignature}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{130}$/`
      )
    })
  })

  describe('Testing limit field.', () => {
    it('should validate field.', async () => {
      expect(FieldValidator.isValidLimit().validate(1)).toEqual({ value: 1 })
    })

    it('should invalidate field.', async () => {
      const validatedField = FieldValidator.isValidLimit().validate('not_a_number')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be a number')
    })
  })

  describe('Testing ethAddress field.', () => {
    it('should validate field.', async () => {
      const ethAddress = '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2682'
      expect(FieldValidator.isValidEthAddress().validate(ethAddress)).toEqual({ value: ethAddress })
    })

    it('should invalidate field.', async () => {
      const invalidAddress = '0xnot_a_valid_eth_address'
      const validatedField = FieldValidator.isValidEthAddress().validate(invalidAddress)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" failed custom validation because invalid address (argument="address", value="${invalidAddress}", code=INVALID_ARGUMENT, version=address/5.7.0)`
      )
    })
  })

  describe('Testing encodedOrder field.', () => {
    it('should validate field.', async () => {
      const encodedOrder = '0x00000000001325ad66ad5fa02621d3ad52c9323c6c2bff26820000000'
      expect(FieldValidator.isValidEncodedOrder().validate(encodedOrder)).toEqual({ value: encodedOrder })
    })

    it('should invalidate field.', async () => {
      const invalidOrder = '0xnot_a_valid_order_$$$$'
      const validatedField = FieldValidator.isValidEncodedOrder().validate(invalidOrder)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" with value "${invalidOrder}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,2000}$/`
      )
    })
  })
})
