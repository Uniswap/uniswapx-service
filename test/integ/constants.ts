import { Token } from "@uniswap/sdk-core"
import { Currency, CurrencyAmount as CurrencyAmountRaw } from '@uniswap/sdk-core'
import { parseUnits } from 'ethers/lib/utils'
import JSBI from "jsbi"

export class CurrencyAmount extends CurrencyAmountRaw<Currency> {}

export function parseAmount(value: string, currency: Currency): CurrencyAmount {
  const typedValueParsed = parseUnits(value, currency.decimals).toString()
  return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed))
}

export const ANVIL_TEST_WALLET_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const ALICE_TEST_WALLET_PK = '0xb774e2eda1f9f22f861463d8cbf0eb09020a6544291f57a6f711cfacdbd8c068'
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export const WETH = new Token(
    1,
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    18,
    'WETH',
)

export const UNI = new Token(
    1,
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    18,
    'UNI',
)
