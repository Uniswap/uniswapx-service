import { ChainId, Token } from '@uniswap/sdk-core'

const USDC_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  6,
  'USDC',
  'USD Coin'
)
const USDT_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  6,
  'USDT',
  'Tether USD'
)
const ZRO_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0x6985884C4392D348587B19cb9eAAf157F13271cd',
  18,
  'ZRO',
  'LayerZero'
)
const ARB_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0x912CE59144191C1204E64559FE8253a0e49E6548',
  18,
  'ARB',
  'Arbitrum'
)
const WETH_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  18,
  'WETH',
  'Wrapped Ether'
)
const WBTC_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  8,
  'WBTC',
  'Wrapped BTC'
)
const LINK_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
  18,
  'LINK',
  'ChainLink Token'
)

const CRV_ARBITRUM = new Token(ChainId.ARBITRUM_ONE, '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978', 18, 'CRV', 'Curve')
const GRT_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0x9623063377AD1B27544C965cCd7342f7EA7e88C7',
  18,
  'GRT',
  'The Graph'
)
const GMX_ARBITRUM = new Token(ChainId.ARBITRUM_ONE, '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', 18, 'GMX', 'GMX')
const AAVE_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196',
  18,
  'AAVE',
  'Aave Token'
)
const PENDLE_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',
  18,
  'PENDLE',
  'Pendle'
)

export const UNIMIND_LIST = [
  USDC_ARBITRUM,
  USDT_ARBITRUM,
  ZRO_ARBITRUM,
  ARB_ARBITRUM,
  WETH_ARBITRUM,
  CRV_ARBITRUM,
  GRT_ARBITRUM,
  GMX_ARBITRUM,
  AAVE_ARBITRUM,
  PENDLE_ARBITRUM,
  LINK_ARBITRUM,
  WBTC_ARBITRUM,
]
