import axios from 'axios'

export const INITIALIZER_TIMEOUT_MS = 5000
export const INITIALIZER_URL = process.env['INITIALIZER_URL']

export const INITIALIZER_COSIGN_HYBRID_PATH = '/cosign/hybrid'
export const INITIALIZER_COSIGN_PRIORITY_PATH = '/cosign/priority'
export const INITIALIZER_COSIGN_DUTCHV2_PATH = '/cosign/dutch_v2'
export const INITIALIZER_COSIGN_DUTCHV3_PATH = '/cosign/dutch_v3'
export const INITIALIZER_COSIGN_DCA_PATH = '/cosign/dca'

export const InitializerClient = axios.create({
  baseURL: INITIALIZER_URL,
  timeout: INITIALIZER_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
})
