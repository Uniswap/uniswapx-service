require('@nomiclabs/hardhat-ethers');

const dotenv = require('dotenv');
dotenv.config();

const mainnetFork = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: `${process.env.FORK_URL}`,
        blockNumber: 16880000,
      },
    },
  },
}
