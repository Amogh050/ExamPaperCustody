// Ethereum & Hardhat Connection, Contract Interface, and Error Decoder — Day 6

import { ethers } from "ethers";
import deployment from "../deployment.json";
import { RPC_URL, CHAIN_ID, HARDHAT_ACCOUNTS, STAGES } from "./constants";

/**
 * Returns a JSON-RPC provider connected to the local Hardhat node.
 */
export function getRpcProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

/**
 * Returns a signer based on the chosen mode:
 * - If selectedAccount is a Hardhat account object with privateKey, returns a Wallet connected to RPC provider.
 * - If selectedAccount is "metamask", connects to window.ethereum.
 */
export async function getSigner(selectedAccount) {
  if (selectedAccount === "metamask") {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed. Please use a pre-configured Hardhat test account.");
    }
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    // Request network switch if not on Hardhat 31337
    const network = await browserProvider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CHAIN_ID.toString(16) }]
        });
      } catch (switchError) {
        // Chain not added to metamask, attempt add
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x" + CHAIN_ID.toString(16),
              chainName: "Hardhat Localhost",
              rpcUrls: [RPC_URL],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }
            }]
          });
        }
      }
    }
    return await browserProvider.getSigner();
  }

  // Use pre-configured Hardhat test account
  const provider = getRpcProvider();
  if (selectedAccount && selectedAccount.privateKey) {
    return new ethers.Wallet(selectedAccount.privateKey, provider);
  }

  // Default to Controller (Account #0)
  return new ethers.Wallet(HARDHAT_ACCOUNTS[0].privateKey, provider);
}

/**
 * Returns a Contract instance connected to the active signer or readonly provider.
 */
export function getContract(signerOrProvider) {
  const provider = signerOrProvider || getRpcProvider();
  return new ethers.Contract(deployment.contractAddress, deployment.abi, provider);
}

/**
 * Human-Readable Revert Decoder
 * Decodes Solidity custom errors into clear, actionable student explanations.
 */
export function decodeContractError(error) {
  if (!error) return "Unknown error occurred.";

  console.warn("Raw contract transaction error:", error);

  // Look for error data inside various ethers error structures
  const data = error.data ||
    error.error?.data ||
    error.info?.error?.data ||
    error.revert?.args ||
    null;

  const iface = new ethers.Interface(deployment.abi);

  // Attempt to parse custom error using the contract interface
  if (data && typeof data === "string" && data.startsWith("0x")) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) {
        const name = parsed.name;
        const args = parsed.args;

        if (name === "InvalidStage") {
          const paperId = args[0].toString();
          const expected = Number(args[1]);
          const actual = Number(args[2]);
          const expectedName = STAGES.find(s => s.id === expected)?.label || expected;
          const actualName = STAGES.find(s => s.id === actual)?.label || actual;
          return `Action Rejected: Paper #${paperId} is at '${actualName}' stage, but '${expectedName}' is required for this step.`;
        }

        if (name === "NotAssignedCentre") {
          const paperId = args[0].toString();
          const caller = args[1];
          const expected = args[2];
          return `Access Denied: Your wallet (${shortenAddress(caller)}) is not the assigned centre for Paper #${paperId}. (Assigned: ${shortenAddress(expected)}).`;
        }

        if (name === "ExamTimeNotReached") {
          const paperId = args[0].toString();
          const examTime = Number(args[1]);
          const currentTime = Number(args[2]);
          const examDate = new Date(examTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const diffMinutes = Math.max(0, Math.ceil((examTime - currentTime) / 60));
          return `Time-Lock Active: Decryption key cannot be released before exam start time (${examDate}). Time remaining: ~${diffMinutes} minutes.`;
        }

        if (name === "PaperIsCompromised") {
          const paperId = args[0].toString();
          return `Operation Blocked: Paper #${paperId} has been flagged as COMPROMISED. The custody pipeline is permanently frozen.`;
        }

        if (name === "CallerHasNoRole") {
          const caller = args[0];
          return `Unauthorized: Wallet (${shortenAddress(caller)}) does not possess any registered role (Admin, Setter, Moderator, Printer, Centre).`;
        }

        if (name === "PaperDoesNotExist") {
          const paperId = args[0].toString();
          return `Invalid Paper ID: Paper #${paperId} does not exist on the smart contract.`;
        }

        if (name === "AccessControlUnauthorizedAccount") {
          const account = args[0];
          return `Access Denied: Wallet (${shortenAddress(account)}) lacks the specific OpenZeppelin role required for this action.`;
        }
      }
    } catch (parseErr) {
      // Fallback to string matching
    }
  }

  // String message heuristics
  const msg = error.reason || error.shortMessage || error.message || "";

  if (msg.includes("InvalidStage")) {
    return "Action Rejected: Paper is not at the expected pipeline stage.";
  }
  if (msg.includes("NotAssignedCentre")) {
    return "Access Denied: You are not the assigned exam centre for this paper.";
  }
  if (msg.includes("ExamTimeNotReached")) {
    return "Time-Lock Active: The scheduled exam start time has not yet arrived.";
  }
  if (msg.includes("PaperIsCompromised")) {
    return "Operation Blocked: This paper was flagged as Compromised and is frozen.";
  }
  if (msg.includes("CallerHasNoRole")) {
    return "Unauthorized: Your wallet has no registered role in the system.";
  }
  if (msg.includes("AccessControl")) {
    return "Access Denied: Your account lacks the required role permissions.";
  }
  if (msg.includes("user rejected action") || msg.includes("ACTION_REJECTED")) {
    return "Transaction cancelled by user.";
  }
  if (msg.includes("could not detect network") || msg.includes("ECONNREFUSED")) {
    return "Cannot connect to local Hardhat node at localhost:8545. Run 'npm run node' in a terminal.";
  }

  return error.shortMessage || error.message || "Transaction failed on blockchain.";
}

/**
 * Fetch and construct the complete audit trail for a given paper ID from contract events.
 */
export async function fetchPaperTimeline(paperId, contract) {
  const provider = contract.runner.provider || getRpcProvider();

  // 1. Filter PaperCreated events
  const filterCreated = contract.filters.PaperCreated(paperId);
  const createdEvents = await contract.queryFilter(filterCreated);

  // 2. Filter StageChanged events
  const filterStage = contract.filters.StageChanged(paperId);
  const stageEvents = await contract.queryFilter(filterStage);

  // 3. Filter PaperCompromised events
  const filterCompromised = contract.filters.PaperCompromised(paperId);
  const compromisedEvents = await contract.queryFilter(filterCompromised);

  const timeline = [];

  // Add PaperCreated entry
  for (const ev of createdEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    timeline.push({
      type: "CREATED",
      stageId: 0,
      stageLabel: "Created",
      actor: ev.args.setter,
      centre: ev.args.centre,
      examTime: Number(ev.args.examTime),
      ciphertextHash: ev.args.ciphertextHash,
      blockNumber: ev.blockNumber,
      timestamp: block ? block.timestamp : Math.floor(Date.now() / 1000),
      txHash: ev.transactionHash
    });
  }

  // Add StageChanged entries
  for (const ev of stageEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const oldStage = Number(ev.args.oldStage);
    const newStage = Number(ev.args.newStage);
    const stageInfo = STAGES.find(s => s.id === newStage);

    timeline.push({
      type: "STAGE_CHANGE",
      stageId: newStage,
      stageLabel: stageInfo?.label || `Stage ${newStage}`,
      oldStageId: oldStage,
      oldStageLabel: STAGES.find(s => s.id === oldStage)?.label || `Stage ${oldStage}`,
      actor: ev.args.changedBy,
      blockNumber: ev.blockNumber,
      timestamp: block ? block.timestamp : Math.floor(Date.now() / 1000),
      txHash: ev.transactionHash
    });
  }

  // Add Compromised entries
  for (const ev of compromisedEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    timeline.push({
      type: "COMPROMISED",
      stageId: 7,
      stageLabel: "🚨 Compromised (Frozen)",
      actor: ev.args.flaggedBy,
      blockNumber: ev.blockNumber,
      timestamp: block ? block.timestamp : Math.floor(Date.now() / 1000),
      txHash: ev.transactionHash
    });
  }

  // Sort chronological by blockNumber and index
  timeline.sort((a, b) => a.blockNumber - b.blockNumber);

  return timeline;
}

export function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}
