// Sepolia testnet deployment script for ExamCustody
//
// Prerequisites:
// 1. Create a .env file with SEPOLIA_RPC_URL and SEPOLIA_PRIVATE_KEY
// 2. Ensure the deployer wallet has Sepolia ETH (https://sepoliafaucet.com/)
//
// What this script does:
// 1. Deploys ExamCustody to Sepolia testnet
// 2. Prompts you to assign role addresses manually (you need real wallets)
// 3. Grants roles on-chain
// 4. Exports deployment info to deployment-sepolia.json
//
// Usage:
//   npx hardhat run scripts/deploySepolia.js --network sepolia

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Utility to prompt for user input
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  ExamCustody — Sepolia Testnet Deployment");
  console.log("════════════════════════════════════════════════════════════\n");

  // Verify we're on Sepolia
  if (network.name !== "sepolia") {
    console.error("❌ Error: This script must be run with --network sepolia");
    process.exit(1);
  }

  // Get deployer (will become Controller / admin)
  const [deployer] = await ethers.getSigners();
  const deployerBalance = await ethers.provider.getBalance(deployer.address);

  console.log("Network:", network.name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("Deployer (Controller):", deployer.address);
  console.log("Balance:", ethers.formatEther(deployerBalance), "ETH\n");

  if (deployerBalance === 0n) {
    console.error("❌ Deployer has 0 ETH! Get Sepolia ETH from https://sepoliafaucet.com/");
    process.exit(1);
  }

  // Deploy the contract
  console.log("Deploying ExamCustody contract to Sepolia...");
  const ExamCustody = await ethers.getContractFactory("ExamCustody");
  const examCustody = await ExamCustody.deploy();
  
  console.log("Waiting for deployment transaction to be mined...");
  await examCustody.waitForDeployment();

  const contractAddress = await examCustody.getAddress();
  console.log("✅ ExamCustody deployed to:", contractAddress);
  console.log("");

  // Read role constants
  const SETTER_ROLE    = await examCustody.SETTER_ROLE();
  const MODERATOR_ROLE = await examCustody.MODERATOR_ROLE();
  const PRINTER_ROLE   = await examCustody.PRINTER_ROLE();
  const CENTRE_ROLE    = await examCustody.CENTRE_ROLE();
  const ADMIN_ROLE     = await examCustody.DEFAULT_ADMIN_ROLE();

  console.log("════════════════════════════════════════════════════════════");
  console.log("  Role Assignment");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log("The deployer is already the Controller (admin).");
  console.log("Now assign addresses for other roles.\n");
  console.log("⚠️  You need real Sepolia wallet addresses for each role.");
  console.log("    Press ENTER to skip a role if not needed now.\n");

  // Prompt for role addresses
  const setterAddress = await prompt("Setter address (0x...): ");
  const moderatorAddress = await prompt("Moderator address (0x...): ");
  const printerAddress = await prompt("Printer address (0x...): ");
  const centreAddress = await prompt("Exam Centre address (0x...): ");

  console.log("");

  const roleAssignments = [];

  if (setterAddress && ethers.isAddress(setterAddress)) {
    roleAssignments.push({ name: "Setter", role: SETTER_ROLE, address: setterAddress });
  }
  if (moderatorAddress && ethers.isAddress(moderatorAddress)) {
    roleAssignments.push({ name: "Moderator", role: MODERATOR_ROLE, address: moderatorAddress });
  }
  if (printerAddress && ethers.isAddress(printerAddress)) {
    roleAssignments.push({ name: "Printer", role: PRINTER_ROLE, address: printerAddress });
  }
  if (centreAddress && ethers.isAddress(centreAddress)) {
    roleAssignments.push({ name: "Centre", role: CENTRE_ROLE, address: centreAddress });
  }

  if (roleAssignments.length === 0) {
    console.log("No roles assigned. You can grant them later using the Controller wallet.");
  } else {
    console.log("Granting roles on-chain...");
    for (const item of roleAssignments) {
      const tx = await examCustody.connect(deployer).grantRole(item.role, item.address);
      console.log(`  Waiting for ${item.name} role grant...`);
      await tx.wait();
      console.log(`  ✅ Granted ${item.name} to ${item.address}`);
    }
  }

  console.log("");

  // Read contract ABI from build artifacts
  const artifactPath = path.join(__dirname, "../artifacts/contracts/ExamCustody.sol/ExamCustody.json");
  let abi = [];
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    abi = artifact.abi;
  }

  // Prepare deployment manifest
  const deploymentInfo = {
    network: "sepolia",
    chainId: "11155111",
    contractAddress: contractAddress,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    accounts: {
      controller: {
        address: deployer.address,
        role: "DEFAULT_ADMIN_ROLE"
      },
      setter: setterAddress || null,
      moderator: moderatorAddress || null,
      printer: printerAddress || null,
      centre: centreAddress || null,
    },
    abi: abi,
    explorerUrl: `https://sepolia.etherscan.io/address/${contractAddress}`,
  };

  // Save deployment info
  const outPath = path.join(__dirname, "../deployment-sepolia.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("✅ Saved deployment info to:", outPath);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  Deployment Complete!");
  console.log("════════════════════════════════════════════════════════════");
  console.log("Contract:", contractAddress);
  console.log("Explorer:", deploymentInfo.explorerUrl);
  console.log("\nNext steps:");
  console.log("1. Verify contract on Etherscan (optional):");
  console.log(`   npx hardhat verify --network sepolia ${contractAddress}`);
  console.log("2. Update server/.env with SEPOLIA_CONTRACT_ADDRESS");
  console.log("3. Configure frontend to use Sepolia chainId (11155111)");
  console.log("════════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
