import { HardhatUserConfig,task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const FORK_FUJI = false
const FORK_MAINNET = true

const forkingData = FORK_FUJI
  ? {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
    }
  : FORK_MAINNET
  ? {
      url: process.env.RPC_ENDPOINT_MAINNET || "",
      blockNumber: 
      39682887,
    }
  : undefined

  const config: HardhatUserConfig = {
    solidity: {
      compilers: [
        {
          version: "0.7.4",
          settings: {
            optimizer: {
              enabled: true,
              runs: 200,
            },
          },
        },
        {
          version: "0.8.20",
          settings: {
            optimizer: {
              enabled: true,
              runs: 200,
            },
          },
        },
      ],
    },
    etherscan: {
      apiKey: {
        avalanche: "snowtrace", 
      }
    },
    networks: {
      hardhat: {
        forking: forkingData
      },
      fuji: {
        url: process.env.RPC_ENDPOINT_TESTNET || "",
        gasPrice: 225000000000,
        chainId: 43113,
        accounts:
          process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      },
      mainnet:{
        url: process.env.RPC_ENDPOINT_MAINNET || "",
        gasPrice: 225000000000,
        chainId: 43114,
        accounts: 
          process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      }
    }
  };

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
     console.log(account.address);
  }
});

export default config;
