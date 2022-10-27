/*
####################################################
# this file will be deleted before merging branch  #
####################################################
*/

import { DynamoDB } from 'aws-sdk'
import { ORDER_STATUS, TABLE_KEY } from '../../entities/Order'

const getItem = (
  orderHash: string,
  orderStatus: string,
  encodedOrder: string,
  signature: string,
  offerer: string,
  sellToken: string
) => {
  return {
    [TABLE_KEY.ORDER_HASH]: orderHash,
    [TABLE_KEY.ORDER_STATUS]: orderStatus,
    [TABLE_KEY.ENCODED_ORDER]: encodedOrder,
    [TABLE_KEY.SIGNATURE]: signature,
    [TABLE_KEY.OFFERER]: offerer,
    [TABLE_KEY.SELL_TOKEN]: sellToken,
    [TABLE_KEY.OFFERER_ORDER_STATUS]: `${offerer}-${orderStatus}`,
    [TABLE_KEY.OFFERER_SELL_TOKEN]: `${offerer}-${sellToken}`,
    [TABLE_KEY.SELL_TOKEN_ORDER_STATUS]: `${sellToken}-${orderStatus}`,
    [TABLE_KEY.CREATED_AT]: new Date().getTime(),
  }
}

export const setupMockItemsInDb = async () => {
  const dbParams = {
    RequestItems: {
      Orders: [
        {
          PutRequest: {
            Item: getItem(
              '0xdeadbeef1',
              ORDER_STATUS.UNVERIFIED,
              '0xencodedorder1',
              '0xsignature1',
              '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2681',
              '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
            ),
          },
        },
        {
          PutRequest: {
            Item: getItem(
              '0xdeadbeef2',
              ORDER_STATUS.UNVERIFIED,
              '0xencodedorder2',
              '0xsignature2',
              '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2681',
              '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
            ),
          },
        },
        {
          PutRequest: {
            Item: getItem(
              '0xdeadbeef3',
              ORDER_STATUS.UNVERIFIED,
              '0xencodedorder3',
              '0xsignature3',
              '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2682',
              '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
            ),
          },
        },
        {
          PutRequest: {
            Item: getItem(
              '0xdeadbeef4',
              ORDER_STATUS.OPEN,
              '0xencodedorder4',
              '0xsignature4',
              '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2682',
              '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
            ),
          },
        },
      ],
    },
  }
  const dynamoClient = new DynamoDB.DocumentClient()
  await dynamoClient.batchWrite(dbParams).promise()
}
