import { AxiosResponse } from 'axios'

const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const callWithRetry = async (fn: () => any, maxdepth = 2, depth = 0): Promise<AxiosResponse> => {
  try {
    return await fn()
  } catch (e: unknown) {
    if (depth >= maxdepth) {
      throw e
    }
    await delay(2 ** depth * 1000)

    return callWithRetry(fn, maxdepth, depth + 1)
  }
}
