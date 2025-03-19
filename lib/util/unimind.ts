import { UNIMIND_DEV_SWAPPER_ADDRESS } from "./constants";

export function unimindAddressFilter(address: string) {
  return address.toLowerCase() === UNIMIND_DEV_SWAPPER_ADDRESS.toLowerCase()
}