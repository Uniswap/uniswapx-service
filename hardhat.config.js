require('@nomiclabs/hardhat-ethers');

const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: `${process.env.JSON_RPC_PROVIDER}`,
        blockNumber: 16880000,
        accounts: {
          count: 1,
        },
      },
    },
  },
}
