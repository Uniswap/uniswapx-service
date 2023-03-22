/**
 * @jest-environment hardhat
 */
import 'jest-environment-hardhat';
import { DutchLimitOrderBuilder } from '@uniswap/gouda-sdk'
import axios from 'axios'
import dotenv from 'dotenv'
import { BigNumber, ethers, Wallet } from 'ethers';
import { ANVIL_TEST_WALLET_PK, UNI, WETH, ZERO_ADDRESS } from './constants'
dotenv.config()

describe('/dutch-auction/order', () => {
    let wallet: Wallet
    let address: string
    let nonce: BigNumber

    beforeEach(async () => {
        wallet = new Wallet(ANVIL_TEST_WALLET_PK)
        address = (await wallet.getAddress()).toLowerCase()

        const getResponse = await axios.get(`${URL}dutch-auction/nonce?address=${address}`)
        expect(getResponse.status).toEqual(200)
        nonce = BigNumber.from(getResponse.data.nonce)
        expect(nonce.lt(ethers.constants.MaxUint256)).toBeTruthy()
    })
    
    // base test case:
    // post order, get nonce, get orders, delete order
    it('erc20 to erc20', async () => {
        const amount = BigNumber.from(10).pow(18)
        // post order
        const deadline = Math.round(new Date().getTime() / 1000) + 10
        const order = new DutchLimitOrderBuilder(1)
            .deadline(deadline)
            .endTime(deadline)
            .startTime(deadline - 5)
            .offerer(await wallet.getAddress())
            .nonce(nonce.add(1))
            .input({
                token: WETH,
                startAmount: amount,
                endAmount: amount,
            })
            .output({
                token: UNI,
                startAmount: amount,
                endAmount: amount,
                recipient: address,
                isFeeOutput: false,
            })
            .build()

        const { domain, types, values } = order.permitData()
        const signature = await wallet._signTypedData(domain, types, values)
        const postResponse = await axios.post(`${URL}dutch-auction/order`, {
            encodedOrder: order.serialize(),
            signature: signature,
            chainId: 1,
        })

        expect(postResponse.status).toEqual(201)
        // orderHash = postResponse.data.hash
        const newGetResponse = await axios.get(`${URL}dutch-auction/nonce?address=${address}`)
        expect(newGetResponse.status).toEqual(200)
        const newNonce = BigNumber.from(newGetResponse.data.nonce)
        expect(newNonce.eq(nonce.add(1))).toBeTruthy()
    })

})