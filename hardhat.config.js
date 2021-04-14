require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('hardhat-abi-exporter');

// require('hardhat-deploy');
// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const privateKey = require('fs').readFileSync('.secret').toString().trim();
module.exports = {
  solidity: {
    version: '0.6.12',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  defaultNetwork: 'localhost',
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    goerli: {
      url:
        'https://eth-goerli.alchemyapi.io/v2/xGtdt4Mu_Kib3_VzN0uoa8s3G57NWPNd',
      accounts: [privateKey],
    },
    rinkeby: {
      url:
        'https://rinkeby.infura.io/v3/d5b0b1695ced49f39207480b43a346b2',
      accounts: [privateKey],
    },
    kovan: {
      url:
        'https://kovan.infura.io/v3/d5b0b1695ced49f39207480b43a346b2',
      accounts: [privateKey],
    },
    testnet: {
      url:
        'https://data-seed-prebsc-1-s3.binance.org:8545/',
      accounts: [privateKey],
    },
    bsc: {
      url:
        'https://bsc-dataseed.binance.org/',
      accounts: [privateKey],
    },
  },
  etherscan: {
    apiKey: '',
    bsc: '',
    ethers: ''
  },
  abiExporter: {
    path: './data/abi',
    clear: true,
    flat: true,
    spacing: 2
  }
};