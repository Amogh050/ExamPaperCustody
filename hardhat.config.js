// Hardhat configuration for ExamPaperCustody
// Uses the hardhat-toolbox plugin (includes ethers, chai, coverage, gas reports)
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Optimise for average number of contract calls
      },
    },
  },

  networks: {
    // Local Hardhat Network (in-memory chain for testing)
    hardhat: {
      chainId: 31337,
    },

    // Sepolia Ethereum testnet
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.SEPOLIA_PRIVATE_KEY
        ? [process.env.SEPOLIA_PRIVATE_KEY]
        : [],
      chainId: 11155111,
    },
  },

  // Etherscan verification (optional)
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
