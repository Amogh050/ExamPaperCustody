// Hardhat configuration for ExamPaperCustody
// Uses the hardhat-toolbox plugin (includes ethers, chai, coverage, gas reports)
require("@nomicfoundation/hardhat-toolbox");

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

  // Default network is the built-in Hardhat Network (in-memory chain)
  // We'll add testnet configs later via .env
  networks: {
    hardhat: {},
  },
};
