import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { SUPPORTED_CHAINS } from '../../util/chain'

export type ProviderMap = Map<typeof SUPPORTED_CHAINS[number], StaticJsonRpcProvider>
