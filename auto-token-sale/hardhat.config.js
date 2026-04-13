require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // BlockDAG Mainnet — Chain ID 1404
    blockdag: {
      url: process.env.BLOCKDAG_RPC_URL || "https://rpc.bdagscan.com/",
      chainId: 1404,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Ethereum Mainnet (BDAG ERC-20 trades on Uniswap here)
    ethereum: {
      url: process.env.ETH_RPC_URL || "",
      chainId: 1,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Base (BDAG ERC-20 trades on Uniswap V2 here)
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
