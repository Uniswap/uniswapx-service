import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

export async function createMainnetFork(networkId: string, blockNumber: number) {
    if(!process.env.TENDERLY_ACCESS_KEY || !process.env.TENDERLY_USER || !process.env.TENDERLY_PROJECT) {
        throw new Error('TENDERLY_ACCESS_KEY, TENDERLY_USER, or TENDERLY_PROJECT not set')
    }

    return await axios.post(
      `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}/fork`,
      {
        network_id: networkId,
        block_number: blockNumber
      },
      {
        headers: {
          'X-Access-Key': process.env.TENDERLY_ACCESS_KEY as string,
        },
      }
    );
  }

export async function deleteMainnetFork(forkId: string) {
    if(!process.env.TENDERLY_ACCESS_KEY || !process.env.TENDERLY_USER || !process.env.TENDERLY_PROJECT) {
        throw new Error('TENDERLY_ACCESS_KEY, TENDERLY_USER, or TENDERLY_PROJECT not set')
    }

    return await axios.delete(
        `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}/fork/${forkId}`,
        {
            headers: {
                'X-Access-Key': process.env.TENDERLY_ACCESS_KEY as string,
            },
        }
    )
}