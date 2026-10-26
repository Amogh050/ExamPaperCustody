// Deploy script for ExamCustody — Day 4
//
// What this script does:
// 1. Connects to the local Hardhat node or in-memory network.
// 2. Uses Hardhat pre-funded test accounts for each project role:
//    - Account #0 -> Controller (DEFAULT_ADMIN_ROLE / deployer)
//    - Account #1 -> Paper Setter (SETTER_ROLE)
//    - Account #2 -> Moderator (MODERATOR_ROLE)
//    - Account #3 -> Printer (PRINTER_ROLE)
//    - Account #4 -> Exam Centre 1 (CENTRE_ROLE)
//    - Account #5 -> Exam Centre 2 (CENTRE_ROLE)
// 3. Deploys the ExamCustody contract.
// 4. Grants each role to its assigned test account.
// 5. Exports deployment info (address, roles, ABI) to `deployment.json`
//    so both the Express backend and React frontend can use it.

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  ExamCustody DApp — Deployment & Role Setup");
  console.log("════════════════════════════════════════════════════════════\n");

  // 1. Get test accounts from Hardhat
  const signers = await ethers.getSigners();
  const [controller, setter, moderator, printer, centre1, centre2] = signers;

  console.log("Network:", network.name);
  console.log("Deployer (Controller):", controller.address);
  console.log("");

  // 2. Deploy the ExamCustody contract
  console.log("Deploying ExamCustody contract...");
  const ExamCustody = await ethers.getContractFactory("ExamCustody");
  const examCustody = await ExamCustody.deploy();
  await examCustody.waitForDeployment();

  const contractAddress = await examCustody.getAddress();
  console.log("ExamCustody deployed to:", contractAddress);
  console.log("");

  // 3. Read role identifiers from the contract
  const SETTER_ROLE    = await examCustody.SETTER_ROLE();
  const MODERATOR_ROLE = await examCustody.MODERATOR_ROLE();
  const PRINTER_ROLE   = await examCustody.PRINTER_ROLE();
  const CENTRE_ROLE    = await examCustody.CENTRE_ROLE();
  const ADMIN_ROLE     = await examCustody.DEFAULT_ADMIN_ROLE();

  // 4. Assign roles to Hardhat test accounts
  console.log("Assigning roles to Hardhat test accounts...");

  const roleAssignments = [
    { name: "Setter", role: SETTER_ROLE, account: setter },
    { name: "Moderator", role: MODERATOR_ROLE, account: moderator },
    { name: "Printer", role: PRINTER_ROLE, account: printer },
    { name: "Centre 1", role: CENTRE_ROLE, account: centre1 },
    { name: "Centre 2", role: CENTRE_ROLE, account: centre2 },
  ];

  for (const item of roleAssignments) {
    const tx = await examCustody.connect(controller).grantRole(item.role, item.account.address);
    await tx.wait();
    console.log(`  [OK] Granted ${item.name} role to ${item.account.address}`);
  }

  console.log("");

  // 5. Verify role assignments
  console.log("Verifying role assignments on-chain:");
  console.log("  Controller has Admin Role :", await examCustody.hasRole(ADMIN_ROLE, controller.address));
  console.log("  Setter has SETTER_ROLE     :", await examCustody.hasRole(SETTER_ROLE, setter.address));
  console.log("  Moderator has MODERATOR    :", await examCustody.hasRole(MODERATOR_ROLE, moderator.address));
  console.log("  Printer has PRINTER_ROLE   :", await examCustody.hasRole(PRINTER_ROLE, printer.address));
  console.log("  Centre 1 has CENTRE_ROLE   :", await examCustody.hasRole(CENTRE_ROLE, centre1.address));
  console.log("  Centre 2 has CENTRE_ROLE   :", await examCustody.hasRole(CENTRE_ROLE, centre2.address));
  console.log("");

  // 6. Read contract ABI from Hardhat build artifacts
  const artifactPath = path.join(__dirname, "../artifacts/contracts/ExamCustody.sol/ExamCustody.json");
  let abi = [];
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    abi = artifact.abi;
  }

  // 7. Prepare deployment manifest
  const deploymentInfo = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    contractAddress: contractAddress,
    deployedAt: new Date().toISOString(),
    accounts: {
      controller: {
        index: 0,
        address: controller.address,
        role: "DEFAULT_ADMIN_ROLE"
      },
      setter: {
        index: 1,
        address: setter.address,
        role: "SETTER_ROLE"
      },
      moderator: {
        index: 2,
        address: moderator.address,
        role: "MODERATOR_ROLE"
      },
      printer: {
        index: 3,
        address: printer.address,
        role: "PRINTER_ROLE"
      },
      centre1: {
        index: 4,
        address: centre1.address,
        role: "CENTRE_ROLE"
      },
      centre2: {
        index: 5,
        address: centre2.address,
        role: "CENTRE_ROLE"
      }
    },
    abi: abi
  };

  // 8. Save deployment.json to root and server/ folders
  const rootOutPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(rootOutPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("Saved deployment configuration to:", rootOutPath);

  const serverDir = path.join(__dirname, "../server");
  if (fs.existsSync(serverDir)) {
    const serverOutPath = path.join(serverDir, "deployment.json");
    fs.writeFileSync(serverOutPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("Saved copy to backend:", serverOutPath);
  }

  const clientSrcDir = path.join(__dirname, "../client/src");
  if (fs.existsSync(clientSrcDir)) {
    const clientOutPath = path.join(clientSrcDir, "deployment.json");
    fs.writeFileSync(clientOutPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("Saved copy to frontend:", clientOutPath);
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  Deployment complete! System ready for off-chain services.");
  console.log("════════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
